import { useEffect, useState, useCallback } from 'react'
import { Save, FolderOpen, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { validatePlacement } from '../../lib/gridfinity.js'

export default function ArrangementManager() {
  const { user } = useAuth()
  const gridConfig      = useStore((s) => s.gridConfig)
  const placements      = useStore((s) => s.placements)
  const loadArrangement = useStore((s) => s.loadArrangement)
  const markSaved       = useStore((s) => s.markSaved)
  const dirty           = useStore((s) => s.dirty)

  const [list,   setList]   = useState([])
  const [name,   setName]   = useState('')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    if (!user) return
    setError('')
    const { data, error: err } = await supabase
      .from('arrangements')
      .select('id,name,grid_width,grid_depth,unit_mm,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (err) { setError(err.message); return }
    setList(data ?? [])
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  async function onSave() {
    setError(''); setStatus('')
    const trimmed = name.trim()
    if (!trimmed)           { setError('Enter a name.'); return }
    if (trimmed.length > 80) { setError('Name too long (max 80 chars).'); return }

    const safePlacements = placements
      .map((p) => ({
        model_id: p.model_id, cell_x: p.cell_x, cell_y: p.cell_y,
        rotation: p.rotation, color: p.color,
      }))
      .filter((p) => validatePlacement(p, gridConfig))

    setBusy(true)
    try {
      const { error: err } = await supabase.from('arrangements').insert({
        user_id:    user.id,
        name:       trimmed,
        grid_width: gridConfig.gridWidth,
        grid_depth: gridConfig.gridDepth,
        unit_mm:    gridConfig.unitMm,
        placements: safePlacements,
      })
      if (err) throw err
      setStatus(`Saved "${trimmed}"`)
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
    setError(''); setStatus('')
    const { data, error: err } = await supabase
      .from('arrangements').select('*').eq('id', id).single()
    if (err) { setError(err.message); return }
    loadArrangement(data)
    setStatus(`Loaded "${data.name}"`)
  }

  async function onDelete(id, label) {
    if (!window.confirm(`Delete "${label}"?`)) return
    setError(''); setStatus('')
    const { error: err } = await supabase.from('arrangements').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setStatus(`Deleted "${label}"`)
    await refresh()
  }

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Save arrangement
          {dirty && <span style={{ color: 'var(--warning)', fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>● unsaved</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input
            type="text"
            placeholder="Arrangement name…"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave()}
          />
          <button
            className="btn-xs primary"
            onClick={onSave}
            disabled={busy || !name.trim()}
            title="Save"
          >
            {busy ? <span className="spinner" /> : <Save size={13} />}
          </button>
        </div>
        {error  && <div className="error-text"   style={{ marginTop: 6 }}>{error}</div>}
        {status && <div className="success-text" style={{ marginTop: 6 }}>{status}</div>}
      </div>

      {list.length > 0 && (
        <div className="panel">
          <div className="panel-title">Saved</div>
          {list.map((a) => (
            <div key={a.id} className="arr-item">
              <div className="arr-info">
                <div className="arr-name">{a.name}</div>
                <div className="arr-sub">
                  {a.grid_width}×{a.grid_depth} · {a.unit_mm} mm ·{' '}
                  {new Date(a.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                className="btn-xs"
                onClick={() => onLoad(a.id)}
                title="Load"
              >
                <FolderOpen size={12} />
              </button>
              <button
                className="btn-xs danger"
                onClick={() => onDelete(a.id, a.name)}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && (
        <p className="hint-text">No saved arrangements yet.</p>
      )}
    </>
  )
}
