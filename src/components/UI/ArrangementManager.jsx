import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { validatePlacement } from '../../lib/gridfinity.js'

// ---------------------------------------------------------------------
// ArrangementManager: Liste der gespeicherten Anordnungen + Speichern/Laden.
// Nutzt nur die `arrangements`-Tabelle (RLS stellt sicher, dass nur
// eigene Arrangements zurückkommen).
// ---------------------------------------------------------------------

export default function ArrangementManager() {
  const { user, isConfigured } = useAuth()
  const gridConfig = useStore((s) => s.gridConfig)
  const placements = useStore((s) => s.placements)
  const loadArrangement = useStore((s) => s.loadArrangement)
  const markSaved = useStore((s) => s.markSaved)
  const dirty = useStore((s) => s.dirty)

  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const disabled = !user || !isConfigured

  async function refresh() {
    if (disabled) return
    setError('')
    const { data, error: err } = await supabase
      .from('arrangements')
      .select('id,name,grid_width,grid_depth,unit_mm,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (err) { setError(err.message); return }
    setList(data ?? [])
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [user])

  async function onSave() {
    if (disabled) return
    setError(''); setStatus('')
    const trimmed = name.trim()
    if (trimmed.length === 0) { setError('Bitte einen Namen eingeben.'); return }
    if (trimmed.length > 80) { setError('Name zu lang (max. 80 Zeichen).'); return }

    // Client-seitige Platzierungs-Validierung vor dem INSERT
    const safePlacements = placements
      .map((p) => ({
        model_id: p.model_id,
        cell_x: p.cell_x,
        cell_y: p.cell_y,
        rotation: p.rotation,
        color: p.color,
      }))
      .filter((p) => validatePlacement(p, gridConfig))

    setBusy(true)
    try {
      const payload = {
        user_id: user.id,
        name: trimmed,
        grid_width: gridConfig.gridWidth,
        grid_depth: gridConfig.gridDepth,
        unit_mm: gridConfig.unitMm,
        placements: safePlacements,
      }
      const { error: err } = await supabase.from('arrangements').insert(payload)
      if (err) throw err
      setStatus(`"${trimmed}" gespeichert.`)
      setName('')
      markSaved()
      await refresh()
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onLoad(id) {
    if (disabled) return
    setError(''); setStatus('')
    const { data, error: err } = await supabase
      .from('arrangements')
      .select('*')
      .eq('id', id)
      .single()
    if (err) { setError(err.message); return }
    loadArrangement(data)
    setStatus(`"${data.name}" geladen.`)
  }

  async function onDelete(id, label) {
    if (disabled) return
    if (!window.confirm(`"${label}" wirklich löschen?`)) return
    setError(''); setStatus('')
    const { error: err } = await supabase.from('arrangements').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setStatus(`"${label}" gelöscht.`)
    await refresh()
  }

  if (!isConfigured) {
    return (
      <div className="stack">
        <h4 style={{ margin: 0 }}>Anordnungen</h4>
        <p className="hint-text">
          Supabase nicht konfiguriert - Speichern/Laden ist deaktiviert.
        </p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="stack">
        <h4 style={{ margin: 0 }}>Anordnungen</h4>
        <p className="hint-text">Melde dich an, um Anordnungen zu speichern.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <h4 style={{ margin: 0 }}>
        Anordnungen {dirty && <span className="hint-text" style={{ fontWeight: 'normal' }}>(ungespeichert)</span>}
      </h4>

      <div className="row">
        <input
          type="text"
          placeholder="Name der Anordnung"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name der neuen Anordnung"
        />
        <button className="primary" onClick={onSave} disabled={busy || !name.trim()}>
          Speichern
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {status && <div style={{ color: 'var(--success)', fontSize: 13 }}>{status}</div>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((a) => (
          <li
            key={a.id}
            style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '6px 8px', marginBottom: 6,
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}
              </div>
              <div className="hint-text">
                {a.grid_width}×{a.grid_depth} · {a.unit_mm} mm · {new Date(a.updated_at).toLocaleDateString()}
              </div>
            </div>
            <button onClick={() => onLoad(a.id)} style={{ padding: '4px 8px', fontSize: 12 }}>Laden</button>
            <button onClick={() => onDelete(a.id, a.name)} className="danger" style={{ padding: '4px 8px', fontSize: 12 }}>✕</button>
          </li>
        ))}
        {list.length === 0 && <li className="hint-text">Noch keine Anordnungen.</li>}
      </ul>
    </div>
  )
}
