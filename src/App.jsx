import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import Toolbar from './components/UI/Toolbar.jsx'
import BottomDrawer from './components/UI/BottomDrawer.jsx'
import GridScene from './components/Scene/GridScene.jsx'
import SceneErrorBoundary from './components/Scene/SceneErrorBoundary.jsx'
import { useStore } from './store.js'

export default function App() {
  const { loading: authLoading } = useAuth()
  const [pendingModelId, setPendingModelId] = useState(null)
  const dirty  = useStore((s) => s.dirty)
  const models = useStore((s) => s.models)

  const pendingModelName = pendingModelId ? models[pendingModelId]?.name : null

  useEffect(() => {
    function onBeforeUnload(e) {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

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
    <div className="app">
      <Toolbar />

      <main className="scene-wrap">
        <SceneErrorBoundary>
          <GridScene
            pendingModelId={pendingModelId}
            onPlaced={() => setPendingModelId(null)}
          />
        </SceneErrorBoundary>

        {pendingModelName && (
          <div className="placement-banner">
            <span className="pulse-dot" />
            Placing <strong style={{ marginLeft: 3 }}>{pendingModelName}</strong>
            &nbsp;· click a cell
          </div>
        )}

        <div className="status-bar">
          {pendingModelName ? (
            <span><span className="kbd">ESC</span> cancel</span>
          ) : (
            <>
              <span>Click cell to place</span>
              <span className="status-sep">·</span>
              <span><span className="kbd">R</span> rotate</span>
              <span><span className="kbd">Del</span> remove</span>
              <span><span className="kbd">Ctrl Z</span> undo</span>
              <span><span className="kbd">↑↓←→</span> move</span>
            </>
          )}
        </div>
      </main>

      <BottomDrawer
        pendingModelId={pendingModelId}
        setPendingModelId={setPendingModelId}
      />
    </div>
  )
}
