import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, X, Download, AlertCircle, Loader } from 'lucide-react'
import { listModelFiles, downloadModelFile } from '../../lib/urlImporter.js'
import { loadModelFromFile } from '../../lib/modelLoader.js'
import { useStore } from '../../store.js'

const PLATFORM_LABELS = { printables: 'Printables', makerworld: 'MakerWorld' }

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ImportFromURLDialog({ onClose }) {
  const addModel = useStore((s) => s.addModel)

  const [url,        setUrl]        = useState('')
  const [listing,    setListing]    = useState(null)   // { platform, modelName, files[] }
  const [selected,   setSelected]   = useState(null)   // file object
  const [fetchState, setFetchState] = useState('idle') // idle | fetching | done | error
  const [dlState,    setDlState]    = useState('idle') // idle | downloading | done | error
  const [error,      setError]      = useState('')

  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleFetch = useCallback(async () => {
    if (!url.trim()) return
    setError('')
    setListing(null)
    setSelected(null)
    setFetchState('fetching')
    try {
      const result = await listModelFiles(url.trim())
      setListing(result)
      if (result.files.length === 1) setSelected(result.files[0])
      setFetchState('done')
    } catch (err) {
      setError(err.message)
      setFetchState('error')
    }
  }, [url])

  const handleImport = useCallback(async () => {
    if (!selected) return
    setError('')
    setDlState('downloading')
    try {
      const file = await downloadModelFile(selected.downloadUrl, selected.name)
      const parts = await loadModelFromFile(file)
      for (const part of parts) {
        addModel({
          id: crypto.randomUUID(),
          name: part.name ?? listing?.modelName ?? selected.name,
          geometry: part.geometry,
          triangleCount: part.triangleCount,
          boundingBox: part.boundingBox,
          sizeBytes: part.sizeBytes,
          source: listing?.platform ?? 'url',
        })
      }
      setDlState('done')
      setTimeout(onClose, 600)
    } catch (err) {
      setError(err.message)
      setDlState('idle')
    }
  }, [selected, listing, addModel, onClose])

  function onUrlKeyDown(e) {
    if (e.key === 'Enter') handleFetch()
  }

  const busy = fetchState === 'fetching' || dlState === 'downloading'

  return (
    <div className="url-dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="url-dialog" role="dialog" aria-modal="true" aria-label="Import from URL">

        {/* Header */}
        <div className="url-dialog-header">
          <Link size={15} />
          <span>Import from URL</span>
          <button className="url-dialog-close" onClick={onClose} title="Close"><X size={14} /></button>
        </div>

        {/* URL input */}
        <div className="url-dialog-body">
          <div className="url-input-row">
            <input
              ref={inputRef}
              className="url-input"
              type="url"
              placeholder="https://www.printables.com/model/… or makerworld.com/…"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setListing(null); setError('') }}
              onKeyDown={onUrlKeyDown}
              disabled={busy}
              spellCheck={false}
            />
            <button
              className="btn-primary"
              onClick={handleFetch}
              disabled={!url.trim() || busy}
            >
              {fetchState === 'fetching' ? <Loader size={13} className="spin" /> : 'Fetch'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="url-dialog-error">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* File list */}
          {listing && (
            <div className="url-dialog-listing">
              <div className="url-dialog-model-name">
                <span className="url-platform-badge">{PLATFORM_LABELS[listing.platform] ?? listing.platform}</span>
                {listing.modelName}
              </div>

              {listing.files.length === 0 ? (
                <p className="url-dialog-hint">No printable files found in this model.</p>
              ) : (
                <div className="url-file-list">
                  {listing.files.map((f) => (
                    <label
                      key={f.id}
                      className={`url-file-row${selected?.id === f.id ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="file-select"
                        checked={selected?.id === f.id}
                        onChange={() => setSelected(f)}
                      />
                      <span className="url-file-name">{f.name}</span>
                      <span className="url-file-meta">
                        <span className="url-file-format">{f.format?.toUpperCase()}</span>
                        {f.size > 0 && <span className="url-file-size">{formatBytes(f.size)}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {listing && listing.files.length > 0 && (
          <div className="url-dialog-footer">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={!selected || busy}
            >
              {dlState === 'downloading'
                ? <><Loader size={13} className="spin" /> Importing…</>
                : dlState === 'done'
                  ? 'Done!'
                  : <><Download size={13} /> Import</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
