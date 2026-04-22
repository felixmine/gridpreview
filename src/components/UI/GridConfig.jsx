import { useStore } from '../../store.js'
import { GRID_LIMITS, validateGridConfig } from '../../lib/gridfinity.js'

function Stepper({ label, value, min, max, onChange, unit }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
        >−</button>
        <span className="stepper-value">
          {value}{unit ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}> {unit}</span> : null}
        </span>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
        >+</button>
      </div>
    </div>
  )
}

export default function GridConfig() {
  const gridConfig    = useStore((s) => s.gridConfig)
  const setGridConfig = useStore((s) => s.setGridConfig)

  function update(field, value) {
    const n = Math.round(value)
    if (!Number.isFinite(n)) return
    const next = { ...gridConfig, [field]: n }
    if (validateGridConfig(next).ok) setGridConfig({ [field]: n })
  }

  const isDefault = gridConfig.unitMm === 42

  return (
    <>
      <div className="panel-title">Grid dimensions</div>

      <div className="field-grid" style={{ marginBottom: 8 }}>
        <Stepper
          label="Width"
          value={gridConfig.gridWidth}
          min={GRID_LIMITS.width.min}
          max={GRID_LIMITS.width.max}
          onChange={(v) => update('gridWidth', v)}
        />
        <Stepper
          label="Depth"
          value={gridConfig.gridDepth}
          min={GRID_LIMITS.depth.min}
          max={GRID_LIMITS.depth.max}
          onChange={(v) => update('gridDepth', v)}
        />
      </div>

      <Stepper
        label="Unit size"
        value={gridConfig.unitMm}
        min={GRID_LIMITS.unit.min}
        max={GRID_LIMITS.unit.max}
        unit="mm"
        onChange={(v) => update('unitMm', v)}
      />

      {isDefault && (
        <p className="hint-text" style={{ marginTop: 6 }}>
          42 mm · Gridfinity standard
        </p>
      )}
    </>
  )
}
