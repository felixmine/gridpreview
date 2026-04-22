import { Undo2, Redo2, RotateCcw, Trash2, X, LogOut } from 'lucide-react'
import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Toolbar() {
  const { user, signOut } = useAuth()

  // Derived booleans avoid re-renders from unrelated state changes
  const canUndo    = useStore((s) => s.history.undo.length > 0)
  const canRedo    = useStore((s) => s.history.redo.length > 0)
  const hasSelection = useStore((s) => s.selectedId !== null)
  const dirty      = useStore((s) => s.dirty)

  const undo            = useStore((s) => s.undo)
  const redo            = useStore((s) => s.redo)
  const clearAll        = useStore((s) => s.clearAll)
  const removePlacement = useStore((s) => s.removePlacement)
  const rotatePlacement = useStore((s) => s.rotatePlacement)
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
        <Undo2 size={15} />
      </button>
      <button
        className="icon-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 size={15} />
      </button>

      <div className="toolbar-divider" />

      <button
        className="icon-btn"
        onClick={() => rotatePlacement(selectedId)}
        disabled={!hasSelection}
        title="Rotate 90° (R)"
      >
        <RotateCcw size={15} />
      </button>
      <button
        className="icon-btn danger"
        onClick={() => removePlacement(selectedId)}
        disabled={!hasSelection}
        title="Delete selected (Del)"
      >
        <Trash2 size={15} />
      </button>

      <div className="toolbar-divider" />

      <button
        className="icon-text-btn"
        onClick={() => { if (window.confirm('Remove all placements?')) clearAll() }}
        title="Clear grid"
      >
        <X size={13} />
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
            <LogOut size={15} />
          </button>
        </>
      ) : (
        <span className="hint-text">Guest mode</span>
      )}
    </header>
  )
}
