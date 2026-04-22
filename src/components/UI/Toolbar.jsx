import { Undo2, Redo2, RotateCcw, Trash2, X, LogOut } from 'lucide-react'
import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'
import ColorPicker from './ColorPicker.jsx'

export default function Toolbar() {
  const { user, signOut } = useAuth()

  const canUndo      = useStore((s) => s.history.undo.length > 0)
  const canRedo      = useStore((s) => s.history.redo.length > 0)
  const hasSelection = useStore((s) => s.selectedId !== null)
  const dirty        = useStore((s) => s.dirty)
  const selectedColor = useStore((s) => {
    if (!s.selectedId) return '#888888'
    return s.placements.find((p) => p.id === s.selectedId)?.color ?? '#888888'
  })

  const undo            = useStore((s) => s.undo)
  const redo            = useStore((s) => s.redo)
  const clearAll        = useStore((s) => s.clearAll)
  const removePlacement = useStore((s) => s.removePlacement)
  const rotatePlacement = useStore((s) => s.rotatePlacement)
  const recolorPlacement = useStore((s) => s.recolorPlacement)
  const selectedId      = useStore((s) => s.selectedId)

  const avatarLetter = user?.email?.[0] ?? '?'

  return (
    <header className="toolbar">
      <div className="toolbar-logo">
        Gridfinity<span>Preview</span>
      </div>

      <div className="toolbar-divider" />

      <button
        className="icon-btn"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={17} />
      </button>
      <button
        className="icon-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 size={17} />
      </button>

      <div className="toolbar-divider" />

      <button
        className="icon-btn"
        onClick={() => rotatePlacement(selectedId)}
        disabled={!hasSelection}
        title="Rotate 90° (R)"
      >
        <RotateCcw size={17} />
      </button>
      <button
        className="icon-btn danger"
        onClick={() => removePlacement(selectedId)}
        disabled={!hasSelection}
        title="Delete selected (Del)"
      >
        <Trash2 size={17} />
      </button>

      {/* Color swatch — only meaningful when something is selected */}
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

      <button
        className="icon-text-btn"
        onClick={() => { if (window.confirm('Remove all placements?')) clearAll() }}
        title="Clear grid"
      >
        <X size={15} />
        Clear grid
      </button>

      <div className="toolbar-spacer" />

      {dirty && (
        <div className="dirty-label">
          <span className="dirty-dot" />
          Unsaved changes
        </div>
      )}

      {user ? (
        <>
          <div className="toolbar-divider" />
          <div className="user-chip" title={user.email}>
            <div className="user-avatar">{avatarLetter}</div>
            <span className="user-chip-email">{user.email}</span>
          </div>
          <button
            className="icon-btn"
            onClick={signOut}
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </>
      ) : (
        <span className="hint-text">Guest mode</span>
      )}
    </header>
  )
}
