import { useState, useRef } from 'react'
import { useStore } from '../../store.js'
import { loadModelFromFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../../lib/modelLoader.js'

// ---------------------------------------------------------------------
// ModelLibrary: Zeigt alle geladenen Modelle + Upload-Button.
// Nach Auswahl eines Modells wird es beim nächsten Klick auf eine Zelle
// platziert (über die pendingModelId im Parent).
// ---------------------------------------------------------------------

export default function ModelLibrary({ pendingModelId, setPendingModelId }) {
  const models = useStore((s) => s.models)
  const addModel = useStore((s) => s.addModel)
  const removeModel = useStore((s) => s.removeModel)
  const fileInputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFilesSelected(e) {
    setError('')
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // Reset, damit dieselbe Datei erneut wählbar ist
    if (!files.length) return

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
  }

  const modelList = Object.values(models)

  return (
    <div className="stack">
      <h4 style={{ margin: 0 }}>Modelle</h4>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        multiple
        onChange={onFilesSelected}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="primary"
      >
        {busy ? <span className="spinner" /> : 'Dateien hochladen'}
      </button>
      <p className="hint-text">
        {ALLOWED_EXTENSIONS.join(', ')} · max {Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB
      </p>
      {error && <div className="error-text">{error}</div>}

      {modelList.length === 0 ? (
        <p className="hint-text">Noch keine Modelle geladen.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {modelList.map((m) => (
            <li
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 'var(--radius)',
                border: '1px solid',
                borderColor: pendingModelId === m.id ? 'var(--accent)' : 'var(--border)',
                background: pendingModelId === m.id ? 'rgba(79,140,255,0.08)' : 'transparent',
                marginBottom: 6,
                cursor: 'pointer',
              }}
              onClick={() => setPendingModelId(pendingModelId === m.id ? null : m.id)}
              title={pendingModelId === m.id
                ? 'Klicke auf eine Zelle im Grid um zu platzieren'
                : 'Modell wählen'}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </div>
                <div className="hint-text">
                  {m.triangleCount.toLocaleString()} Dreiecke
                </div>
              </div>
              <button
                type="button"
                className="danger"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={(e) => { e.stopPropagation(); removeModel(m.id) }}
                title="Modell entfernen"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {pendingModelId && (
        <div className="hint-text" style={{ color: 'var(--accent)' }}>
          Klicke eine Zelle um zu platzieren · ESC zum Abbrechen
        </div>
      )}
    </div>
  )
}
