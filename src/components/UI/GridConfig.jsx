import { useStore } from '../../store.js'
import { GRID_LIMITS, validateGridConfig } from '../../lib/gridfinity.js'

// ---------------------------------------------------------------------
// GridConfig: Editor für Breite, Tiefe und Einheitsgröße des Grids.
// ---------------------------------------------------------------------

export default function GridConfig() {
  const gridConfig = useStore((s) => s.gridConfig)
  const setGridConfig = useStore((s) => s.setGridConfig)

  const updateField = (field, raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const next = { ...gridConfig, [field]: Math.round(n) }
    const v = validateGridConfig(next)
    if (v.ok) setGridConfig({ [field]: Math.round(n) })
  }

  return (
    <div className="stack">
      <h4 style={{ margin: 0 }}>Grid</h4>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label htmlFor="gw">Breite</label>
          <input
            id="gw" type="number"
            min={GRID_LIMITS.width.min} max={GRID_LIMITS.width.max}
            value={gridConfig.gridWidth}
            onChange={(e) => updateField('gridWidth', e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="gd">Tiefe</label>
          <input
            id="gd" type="number"
            min={GRID_LIMITS.depth.min} max={GRID_LIMITS.depth.max}
            value={gridConfig.gridDepth}
            onChange={(e) => updateField('gridDepth', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="unit">Einheit (mm)</label>
        <input
          id="unit" type="number"
          min={GRID_LIMITS.unit.min} max={GRID_LIMITS.unit.max}
          value={gridConfig.unitMm}
          onChange={(e) => updateField('unitMm', e.target.value)}
        />
        <p className="hint-text" style={{ marginTop: 4 }}>
          Gridfinity-Standard: 42 mm
        </p>
      </div>
    </div>
  )
}
