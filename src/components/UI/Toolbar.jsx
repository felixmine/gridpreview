import { useStore } from '../../store.js'
import { useAuth } from '../../context/AuthContext.jsx'

// ---------------------------------------------------------------------
// Toolbar: Kopfzeile mit App-Titel, User-Status und globalen Aktionen
// (Undo, Redo, Clear, Logout).
// ---------------------------------------------------------------------

export default function Toolbar() {
  const { user, signOut } = useAuth()
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const clearAll = useStore((s) => s.clearAll)
  const history = useStore((s) => s.history)
  const selectedId = useStore((s) => s.selectedId)
  const removePlacement = useStore((s) => s.removePlacement)
  const rotatePlacement = useStore((s) => s.rotatePlacement)

  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elev)',
        flexShrink: 0,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, marginRight: 8 }}>
        Gridfinity <span style={{ color: 'var(--accent)' }}>Preview</span>
      </h1>

      <div className="row" style={{ gap: 6 }}>
        <button
          onClick={undo}
          disabled={history.undo.length === 0}
          title="Rückgängig (Ctrl+Z)"
          style={{ padding: '6px 10px' }}
        >↶ Undo</button>
        <button
          onClick={redo}
          disabled={history.redo.length === 0}
          title="Wiederholen (Ctrl+Y)"
          style={{ padding: '6px 10px' }}
        >↷ Redo</button>
        <button
          onClick={() => rotatePlacement(selectedId)}
          disabled={!selectedId}
          title="Drehen (R)"
          style={{ padding: '6px 10px' }}
        >⟳ Drehen</button>
        <button
          onClick={() => removePlacement(selectedId)}
          disabled={!selectedId}
          title="Löschen (Entf)"
          className="danger"
          style={{ padding: '6px 10px' }}
        >Löschen</button>
        <button
          onClick={() => { if (confirm('Alle Platzierungen entfernen?')) clearAll() }}
          style={{ padding: '6px 10px' }}
          title="Gesamtes Grid leeren"
        >Grid leeren</button>
      </div>

      <div style={{ flex: 1 }} />

      {user ? (
        <>
          <span className="hint-text" title={user.email}>
            {user.email}
          </span>
          <button onClick={signOut} style={{ padding: '6px 10px' }}>Abmelden</button>
        </>
      ) : (
        <span className="hint-text">Gastmodus</span>
      )}
    </header>
  )
}
