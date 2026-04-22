import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import Toolbar from './components/UI/Toolbar.jsx'
import GridConfig from './components/UI/GridConfig.jsx'
import ModelLibrary from './components/UI/ModelLibrary.jsx'
import ArrangementManager from './components/UI/ArrangementManager.jsx'
import AuthPanel from './components/Auth/AuthPanel.jsx'
import GridScene from './components/Scene/GridScene.jsx'
import SceneErrorBoundary from './components/Scene/SceneErrorBoundary.jsx'
import { useStore } from './store.js'

// ---------------------------------------------------------------------
// App: Haupt-Layout. Linke Sidebar mit Konfiguration + Auth, rechts die
// 3D-Scene.
// ---------------------------------------------------------------------

export default function App() {
  const { user, loading: authLoading } = useAuth()
  const [pendingModelId, setPendingModelId] = useState(null)
  const dirty = useStore((s) => s.dirty)

  // Warnung vor Datenverlust bei ungespeicherten Änderungen
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ESC beendet den Platzierungs-Modus
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setPendingModelId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (authLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar />
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            overflow: 'auto',
            borderRight: '1px solid var(--border)',
            padding: 14,
            display: 'flex', flexDirection: 'column', gap: 16,
            background: 'var(--bg)',
          }}
        >
          {!user && <AuthPanel />}
          <div className="panel"><GridConfig /></div>
          <div className="panel">
            <ModelLibrary pendingModelId={pendingModelId} setPendingModelId={setPendingModelId} />
          </div>
          <div className="panel"><ArrangementManager /></div>

          <footer className="hint-text" style={{ marginTop: 'auto', fontSize: 11, lineHeight: 1.5 }}>
            <strong>Shortcuts:</strong> Klick auf Zelle = platzieren/verschieben · Drag = ziehen · ↑↓←→ = verschieben · R drehen · Entf löschen · Ctrl+Z/Y undo/redo · ESC abwählen
          </footer>
        </aside>

        <main style={{ position: 'relative', minWidth: 0 }}>
          <SceneErrorBoundary>
            <GridScene
              pendingModelId={pendingModelId}
              onPlaced={() => setPendingModelId(null)}
            />
          </SceneErrorBoundary>
        </main>
      </div>
    </div>
  )
}
