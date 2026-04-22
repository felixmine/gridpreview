import { useState, useRef, useCallback } from 'react'
import { Upload, Box, Trash2 } from 'lucide-react'
import { useStore } from '../../store.js'
import { loadModelFromFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../../lib/modelLoader.js'

const HINT = ALLOWED_EXTENSIONS.join(' · ').toUpperCase()
const MAX_MB = Math.round(MAX_FILE_SIZE / 1024 / 1024)

export default function ModelLibrary({ pendingModelId, setPendingModelId }) {
  const models      = useStore((s) => s.models)
  const addModel    = useStore((s) => s.addModel)
  const removeModel = useStore((s) => s.removeModel)

  const fileInputRef = useRef(null)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(async (files) => {
    if (!files.length) return
    setError('')
    setBusy(true)
    for (const file of files) {
      try {
        const parts = await loadModelFromFile(file)
        for (const part of parts) {
          addModel({
            id: crypto.randomUUID(),
            name: part.name,
            geometry: part.geometry,
            triangleCount: part.triangleCount,
            boundingBox: part.boundingBox,
            sizeBytes: part.sizeBytes,
            source: 'local',
          })
        }
      } catch (err) {
        setError(`${file.name}: ${err.message}`)
      }
    }
    setBusy(false)
  }, [addModel])

  function onFileInput(e) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    handleFiles(files)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  function onDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
  }

  const modelList = Object.values(models)

  return (
    <>
      {/* Drop zone */}
      <div
        className={`drop-zone${dragging ? ' drag-over' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          multiple
          onChange={onFileInput}
          style={{ display: 'none' }}
        />
        {busy
          ? <span className="spinner" />
          : <Upload size={22} strokeWidth={1.5} />
        }
        <div className="drop-zone-title">
          {busy ? 'Loading…' : 'Drop files or click to browse'}
        </div>
        <div className="drop-zone-hint">{HINT} · max {MAX_MB} MB</div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* Model list */}
      {modelList.length > 0 && (
        <div className="panel">
          <div className="panel-title">
            Library
            <span style={{ color: 'var(--text-subtle)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {modelList.length}
            </span>
          </div>

          {modelList.map((m) => {
            const selected = pendingModelId === m.id
            return (
              <div
                key={m.id}
                className={`model-card${selected ? ' selected' : ''}`}
                onClick={() => setPendingModelId(selected ? null : m.id)}
                title={selected ? 'Click a cell to place · ESC to cancel' : 'Select to place'}
              >
                <div className="model-icon">
                  <Box size={14} />
                </div>
                <div className="model-meta">
                  <div className="model-name">{m.name}</div>
                  <div className="model-sub">{m.triangleCount.toLocaleString()} triangles</div>
                </div>
                <button
                  type="button"
                  className="btn-xs danger"
                  onClick={(e) => { e.stopPropagation(); removeModel(m.id) }}
                  title="Remove model"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {modelList.length === 0 && !busy && (
        <p className="hint-text">No models loaded yet.</p>
      )}

      {pendingModelId && (
        <div style={{
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          padding: '9px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span className="pulse-dot" />
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>
            Click a grid cell to place · <strong>ESC</strong> to cancel
          </span>
        </div>
      )}
    </>
  )
}
