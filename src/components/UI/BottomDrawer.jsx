import { useState, useRef, useCallback } from 'react'
import { Upload, ChevronDown } from 'lucide-react'
import { useStore } from '../../store.js'
import { loadModelFromFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../../lib/modelLoader.js'
import ModelLibrary from './ModelLibrary.jsx'

const MAX_MB = Math.round(MAX_FILE_SIZE / 1024 / 1024)

export default function BottomDrawer({ pendingModelId, setPendingModelId }) {
  const [open,     setOpen]     = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [dragging, setDragging] = useState(false)

  const addModel   = useStore((s) => s.addModel)
  const models     = useStore((s) => s.models)
  const modelCount = Object.keys(models).length

  const fileInputRef = useRef(null)

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

  return (
    <div
      className={`bottom-drawer${open ? ' open' : ''}${dragging ? ' drag-active' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* Handle bar */}
      <div className="drawer-handle">
        <button
          type="button"
          className="drawer-chevron"
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Collapse' : 'Expand'}
        >
          <ChevronDown size={16} />
        </button>
        <span className="drawer-title" onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>Models</span>
        {modelCount > 0 && <span className="drawer-count">{modelCount}</span>}

        <div className="drawer-handle-spacer" />

        {error && (
          <span className="drawer-error" title={error}>
            {error.length > 48 ? error.slice(0, 48) + '…' : error}
          </span>
        )}
        {busy && <span className="spinner" />}

        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          onClick={() => fileInputRef.current?.click()}
          title={`Upload model · max ${MAX_MB} MB`}
          disabled={busy}
        >
          <Upload size={13} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          multiple
          onChange={onFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {/* Drawer body */}
      <div className="drawer-body">
        {modelCount === 0 ? (
          <div className="drawer-empty" onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer' }}>
            <Upload size={18} strokeWidth={1.5} />
            <span>Drop files here or click to upload</span>
            <span className="hint-text" style={{ fontSize: 11 }}>
              {ALLOWED_EXTENSIONS.join(' · ').toUpperCase()} · max {MAX_MB} MB
            </span>
          </div>
        ) : (
          <ModelLibrary
            pendingModelId={pendingModelId}
            setPendingModelId={setPendingModelId}
            onUpload={() => fileInputRef.current?.click()}
          />
        )}
      </div>
    </div>
  )
}
