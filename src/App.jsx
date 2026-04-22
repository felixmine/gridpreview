import { useState, useEffect } from 'react'
import { LayoutGrid, Package, BookOpen } from 'lucide-react'
import { useAuth } from './context/AuthContext.jsx'
import Toolbar from './components/UI/Toolbar.jsx'
import GridConfig from './components/UI/GridConfig.jsx'
import ModelLibrary from './components/UI/ModelLibrary.jsx'
import ArrangementManager from './components/UI/ArrangementManager.jsx'
import AuthPanel from './components/Auth/AuthPanel.jsx'
import GridScene from './components/Scene/GridScene.jsx'
import SceneErrorBoundary from './components/Scene/SceneErrorBoundary.jsx'
import { useStore } from './store.js'

const TABS = [
  { id: 'grid',   Icon: LayoutGrid, label: 'Grid' },
  { id: 'models', Icon: Package,    label: 'Models' },
  { id: 'saved',  Icon: BookOpen,   label: 'Saved' },
]

function GridTabContent() {
  const placements  = useStore((s) => s.placements)
  const gridConfig  = useStore((s) => s.gridConfig)
  const total       = gridConfig.gridWidth * gridConfig.gridDepth
  const placed      = placements.length
  const freePercent = total > 0 ? Math.round(((total - placed) / total) * 100) : 100

  return (
    <>
      <div className="panel">
        <GridConfig />
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Cells</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{placed}</div>
          <div className="stat-label">Placed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: freePercent > 30 ? 'var(--success)' : 'var(--warning)' }}>
            {freePercent}%
          </div>
          <div className="stat-label">Free</div>
        </div>
      </div>
    </>
  )
}

function SavedTabContent() {
  const { user, isConfigured } = useAuth()
  if (!isConfigured) {
    return (
      <div className="panel hint-text" style={{ lineHeight: 1.6 }}>
        Supabase not configured. Add a <code>.env.local</code> with your Supabase keys to enable cloud saves.
      </div>
    )
  }
  if (!user) return <AuthPanel />
  return <ArrangementManager />
}

export default function App() {
  const { loading: authLoading, user } = useAuth()
  const [activeTab,      setActiveTab]      = useState('grid')
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

  const showSavedBadge = !user

  return (
    <div className="app">
      <Toolbar />

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-tabs">
            {TABS.map(({ id, Icon, label }) => (
              <button
                key={id}
                className={`stab${activeTab === id ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={13} />
                {label}
                {id === 'saved' && showSavedBadge && <span className="stab-badge" />}
              </button>
            ))}
          </nav>

          <div className="sidebar-content">
            {activeTab === 'grid'   && <GridTabContent />}
            {activeTab === 'models' && (
              <ModelLibrary
                pendingModelId={pendingModelId}
                setPendingModelId={setPendingModelId}
              />
            )}
            {activeTab === 'saved'  && <SavedTabContent />}
          </div>
        </aside>

        {/* 3D Scene */}
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
              <>
                <span><span className="kbd">ESC</span> cancel</span>
              </>
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
      </div>
    </div>
  )
}
