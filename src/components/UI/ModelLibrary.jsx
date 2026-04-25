import { useStore } from '../../store.js'
import { Trash2, Upload } from 'lucide-react'
import ColorPicker from './ColorPicker.jsx'
import ModelThumbnail from './ModelThumbnail.jsx'

export default function ModelLibrary({ pendingModelId, setPendingModelId, onUpload }) {
  const models        = useStore((s) => s.models)
  const removeModel   = useStore((s) => s.removeModel)
  const setModelColor = useStore((s) => s.setModelColor)

  const modelList = Object.values(models)

  if (modelList.length === 0) {
    return (
      <div className="model-tiles-empty">
        <span className="hint-text">No models yet — click ↑ to upload</span>
      </div>
    )
  }

  return (
    <div className="model-tiles">
      {modelList.map((m) => {
        const selected = pendingModelId === m.id
        return (
          <div
            key={m.id}
            className={`model-tile${selected ? ' selected' : ''}`}
            onClick={() => setPendingModelId(selected ? null : m.id)}
            title={selected ? 'Click a cell to place · ESC to cancel' : 'Select to place on grid'}
          >
            <div className="model-tile-thumb">
              <ModelThumbnail geometry={m.geometry} color={m.preferredColor ?? '#4f8cff'} />
            </div>
            <div className="model-tile-info">
              <div className="model-tile-name" title={m.name}>{m.name}</div>
              <div className="model-tile-sub">{m.triangleCount.toLocaleString()} tri</div>
              <div className="model-tile-actions">
                <div onClick={(e) => e.stopPropagation()}>
                  <ColorPicker
                    value={m.preferredColor ?? '#888888'}
                    onChange={(hex) => setModelColor(m.id, hex)}
                    placement="top"
                  >
                    <div
                      className="model-color-swatch"
                      style={{ background: m.preferredColor ?? '#888' }}
                      title="Set model color"
                    />
                  </ColorPicker>
                </div>
                <button
                  type="button"
                  className="btn-xs danger"
                  onClick={(e) => { e.stopPropagation(); removeModel(m.id) }}
                  title="Remove model"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {onUpload && (
        <div className="model-tile model-tile-upload" onClick={onUpload} title="Upload model">
          <div className="model-tile-upload-inner">
            <Upload size={20} strokeWidth={1.5} />
            <span>Add model</span>
          </div>
        </div>
      )}
    </div>
  )
}
