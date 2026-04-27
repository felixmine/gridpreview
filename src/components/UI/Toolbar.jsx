import { useState, useEffect, useCallback } from 'react'
import {
  Undo2, Redo2, RotateCcw, Trash2, X, LogOut, LogIn,
  Save, FolderOpen, Ruler,
} from 'lucide-react'
import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { GRID_LIMITS, validateGridConfig, computeCellSpan, validatePlacement } from '../../lib/gridfinity.js'
import { supabase } from '../../lib/supabase.js'
import { restoreModels } from '../../lib/modelPersistence.js'
import ColorPicker from './ColorPicker.jsx'
import AuthPanel from '../Auth/AuthPanel.jsx'

// Compact ± stepper used inline in the top bar
function TopStepper({ value, min, max, onChange }) {
  return (
    <div className="topbar-stepper">
      <button
        type="button"
        className="topbar-step-btn"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
      >−</button>
      <span className="topbar-step-val">{value}</span>
      <button
        type="button"
        className="topbar-step-btn"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
      >+</button>
    </div>
  )
}

export default function Toolbar() {
  const { user, signOut, isConfigured } = useAuth()

  // ── Selection / history ──────────────────────────────────────────────
  const canUndo        = useStore((s) => s.history.undo.length > 0)
  const canRedo        = useStore((s) => s.history.redo.length > 0)
  const hasSelection   = useStore((s) => s.selectedId !== null)
  const dirty          = useStore((s) => s.dirty)
  const selectedColor  = useStore((s) => {
    if (!s.selectedId) return '#888888'
    return s.placements.find((p) => p.id === s.selectedId)?.color ?? '#888888'
  })
  const selectedId     = useStore((s) => s.selectedId)
  const undo             = useStore((s) => s.undo)
  const redo             = useStore((s) => s.redo)
  const clearAll         = useStore((s) => s.clearAll)
  const removePlacement  = useStore((s) => s.removePlacement)
  const rotatePlacement  = useStore((s) => s.rotatePlacement)
  const recolorPlacement = useStore((s) => s.recolorPlacement)

  // ── Grid config + stats ───────────────────────────────────────────────
  const gridConfig    = useStore((s) => s.gridConfig)
  const setGridConfig = useStore((s) => s.setGridConfig)
  const placements    = useStore((s) => s.placements)
  const models        = useStore((s) => s.models)
  const markSaved          = useStore((s) => s.markSaved)
  const addModel           = useStore((s) => s.addModel)
  const loadArr            = useStore((s) => s.loadArrangement)
  const captureScreenshot  = useStore((s) => s.captureScreenshot)

  const total = gridConfig.gridWidth * gridConfig.gridDepth
  const occupiedCells = placements.reduce((acc, p) => {
    const { spanX, spanY } = computeCellSpan(
      models[p.model_id]?.boundingBox ?? null,
      gridConfig.unitMm,
    )
    return acc + spanX * spanY
  }, 0)
  const freePercent = total > 0
    ? Math.max(0, Math.round(((total - occupiedCells) / total) * 100))
    : 100

  function updateGrid(field, value) {
    const n = Math.round(value)
    if (!Number.isFinite(n)) return
    const next = { ...gridConfig, [field]: n }
    if (validateGridConfig(next).ok) setGridConfig({ [field]: n })
  }

  // ── Popover state ─────────────────────────────────────────────────────
  const [openPopover, setOpenPopover] = useState(null)

  function togglePopover(name) {
    setOpenPopover((v) => (v === name ? null : name))
  }

  useEffect(() => {
    if (!openPopover) return
    function onDown(e) {
      if (!e.target.closest('.topbar-popover-anchor')) setOpenPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openPopover])

  // ── Arrangements (save / load) ────────────────────────────────────────
  const [arrangementName, setArrangementName] = useState('')
  const [arrangements,    setArrangements]    = useState([])
  const [saveBusy,        setSaveBusy]        = useState(false)
  const [saveError,       setSaveError]       = useState('')
  const [saveStatus,      setSaveStatus]      = useState('')

  const refreshArrangements = useCallback(async () => {
    if (!user || !isConfigured) return
    const { data } = await supabase
      .from('arrangements')
      .select('id,name,grid_width,grid_depth,unit_mm,updated_at,preview_url')
      .order('updated_at', { ascending: false })
      .limit(50)
    setArrangements(data ?? [])
  }, [user, isConfigured])

  useEffect(() => {
    if (openPopover === 'saved') refreshArrangements()
  }, [openPopover, refreshArrangements])

  async function onSave() {
    setSaveError(''); setSaveStatus('')
    const trimmed = arrangementName.trim()
    if (!trimmed) { setSaveError('Enter a name.'); return }
    if (trimmed.length > 80) { setSaveError('Name too long (max 80).'); return }
    setSaveBusy(true)
    try {
      const safePlacements = placements
        .map((p) => ({
          model_id: p.model_id, cell_x: p.cell_x, cell_y: p.cell_y,
          rotation: p.rotation, color: p.color,
        }))
        .filter((p) => validatePlacement(p, gridConfig))
      const preview_url = captureScreenshot()
      const { error } = await supabase.from('arrangements').insert({
        user_id:    user.id,
        name:       trimmed,
        grid_width: gridConfig.gridWidth,
        grid_depth: gridConfig.gridDepth,
        unit_mm:    gridConfig.unitMm,
        placements: safePlacements,
        preview_url,
      })
      if (error) throw error
      setSaveStatus('Saved!')
      setArrangementName('')
      markSaved()
    } catch (err) {
      setSaveError(err.message ?? String(err))
    } finally {
      setSaveBusy(false)
    }
  }

  async function onLoad(id) {
    const { data } = await supabase
      .from('arrangements').select('*').eq('id', id).single()
    if (!data) return
    loadArr(data)
    setOpenPopover(null)
    if (user) {
      const neededIds = (data.placements ?? []).map((p) => p.model_id)
      restoreModels(neededIds, user.id, useStore.getState().models, addModel).catch(() => {})
    }
  }

  async function onDelete(id, label) {
    if (!window.confirm(`Delete "${label}"?`)) return
    await supabase.from('arrangements').delete().eq('id', id)
    refreshArrangements()
  }

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <header className="toolbar">
      {/* Logo */}
      <div className="toolbar-logo">Gridfinity<span>Preview</span></div>

      <div className="toolbar-divider" />

      {/* History */}
      <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 size={16} />
      </button>

      <div className="toolbar-divider" />

      {/* Selection actions */}
      <button
        className="icon-btn"
        onClick={() => rotatePlacement(selectedId)}
        disabled={!hasSelection}
        title="Rotate 90° (R)"
      >
        <RotateCcw size={16} />
      </button>
      <button
        className="icon-btn danger"
        onClick={() => removePlacement(selectedId)}
        disabled={!hasSelection}
        title="Delete selected (Del)"
      >
        <Trash2 size={16} />
      </button>
      <ColorPicker
        value={selectedColor}
        onChange={(hex) => recolorPlacement(selectedId, hex)}
        disabled={!hasSelection}
      >
        <button
          className="icon-btn"
          disabled={!hasSelection}
          title="Change placement color"
          style={hasSelection ? {
            background: selectedColor,
            borderColor: selectedColor,
            boxShadow: `0 0 0 2px var(--bg-elev), 0 0 0 3px ${selectedColor}44`,
          } : undefined}
        />
      </ColorPicker>

      <div className="toolbar-divider" />

      {/* Grid W × D inline */}
      <div className="topbar-dim-group">
        <span className="topbar-dim-label">W</span>
        <TopStepper
          value={gridConfig.gridWidth}
          min={GRID_LIMITS.width.min}
          max={GRID_LIMITS.width.max}
          onChange={(v) => updateGrid('gridWidth', v)}
        />
        <span className="topbar-dim-sep">×</span>
        <span className="topbar-dim-label">D</span>
        <TopStepper
          value={gridConfig.gridDepth}
          min={GRID_LIMITS.depth.min}
          max={GRID_LIMITS.depth.max}
          onChange={(v) => updateGrid('gridDepth', v)}
        />
        <span className="topbar-grid-stats">
          {total} cells · {freePercent}% free
        </span>
      </div>

      <div className="toolbar-spacer" />

      {/* Dirty indicator */}
      {dirty && (
        <div className="dirty-label">
          <span className="dirty-dot" />
          Unsaved
        </div>
      )}

      {/* Unit popover */}
      <div className="topbar-popover-anchor">
        <button
          className={`icon-text-btn${openPopover === 'unit' ? ' active' : ''}`}
          onClick={() => togglePopover('unit')}
          title="Grid unit size"
        >
          <Ruler size={14} />
          {gridConfig.unitMm} mm
        </button>
        {openPopover === 'unit' && (
          <div className="topbar-popover" style={{ minWidth: 180 }}>
            <div className="topbar-popover-label">Unit size</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TopStepper
                value={gridConfig.unitMm}
                min={GRID_LIMITS.unit.min}
                max={GRID_LIMITS.unit.max}
                onChange={(v) => updateGrid('unitMm', v)}
              />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>mm</span>
            </div>
            {gridConfig.unitMm === 42 && (
              <div className="hint-text" style={{ fontSize: 11 }}>Gridfinity standard</div>
            )}
          </div>
        )}
      </div>

      {/* Clear grid */}
      <button
        className="icon-text-btn"
        onClick={() => { if (window.confirm('Remove all placements?')) clearAll() }}
        title="Remove all placements"
      >
        <X size={14} />
        Clear
      </button>

      {/* Save + load — only when logged in */}
      {isConfigured && user && (<>
        <div className="toolbar-divider" />

        <div className="topbar-popover-anchor">
          <button
            className={`icon-text-btn${openPopover === 'save' ? ' active' : ''}`}
            onClick={() => togglePopover('save')}
            title="Save arrangement"
          >
            <Save size={14} />
            Save
          </button>
          {openPopover === 'save' && (
            <div className="topbar-popover" style={{ width: 220 }}>
              <div className="topbar-popover-label">
                Save arrangement
                {dirty && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>● unsaved</span>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input
                  type="text"
                  placeholder="Name…"
                  maxLength={80}
                  value={arrangementName}
                  onChange={(e) => setArrangementName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && arrangementName.trim() && onSave()}
                  style={{ fontSize: 12 }}
                  autoFocus
                />
                <button
                  className="btn-xs primary"
                  onClick={onSave}
                  disabled={saveBusy || !arrangementName.trim()}
                >
                  {saveBusy ? <span className="spinner" /> : <Save size={12} />}
                </button>
              </div>
              {saveError  && <div className="error-text"   style={{ fontSize: 11 }}>{saveError}</div>}
              {saveStatus && <div className="success-text" style={{ fontSize: 11 }}>{saveStatus}</div>}
            </div>
          )}
        </div>

        <div className="topbar-popover-anchor">
          <button
            className={`icon-text-btn${openPopover === 'saved' ? ' active' : ''}`}
            onClick={() => togglePopover('saved')}
            title="Saved arrangements"
          >
            <FolderOpen size={14} />
            Open
          </button>
          {openPopover === 'saved' && (
            <div className="topbar-popover" style={{ width: 300, maxHeight: 380, overflowY: 'auto' }}>
              <div className="topbar-popover-label">Saved arrangements</div>
              {arrangements.length === 0 ? (
                <p className="hint-text" style={{ fontSize: 11 }}>No saved arrangements yet.</p>
              ) : arrangements.map((a) => (
                <div key={a.id} className="arr-item" style={{ marginBottom: 6, alignItems: 'flex-start', gap: 8 }}>
                  {a.preview_url && (
                    <img
                      src={a.preview_url}
                      alt=""
                      style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid var(--border)' }}
                    />
                  )}
                  <div className="arr-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="arr-name">{a.name}</div>
                    <div className="arr-sub">
                      {a.grid_width}×{a.grid_depth} · {a.unit_mm} mm ·{' '}
                      {new Date(a.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="btn-xs" onClick={() => onLoad(a.id)} title="Load">
                    <FolderOpen size={11} />
                  </button>
                  <button className="btn-xs danger" onClick={() => onDelete(a.id, a.name)} title="Delete">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}

      <div className="toolbar-divider" />

      {/* Auth */}
      {user ? (
        <>
          <div className="user-chip" title={user.email}>
            <div className="user-avatar">{avatarLetter}</div>
            <span className="user-chip-email">{user.email}</span>
          </div>
          <button className="icon-btn" onClick={signOut} title="Sign out">
            <LogOut size={16} />
          </button>
        </>
      ) : isConfigured ? (
        <div className="topbar-popover-anchor">
          <button
            className={`icon-btn${openPopover === 'auth' ? ' active' : ''}`}
            onClick={() => togglePopover('auth')}
            title="Sign in"
          >
            <LogIn size={16} />
          </button>
          {openPopover === 'auth' && (
            <div className="topbar-popover" style={{ width: 280 }}>
              <AuthPanel />
            </div>
          )}
        </div>
      ) : (
        <span className="hint-text" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>Guest mode</span>
      )}
    </header>
  )
}
