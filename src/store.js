import { create } from 'zustand'
import { DEFAULT_UNIT_MM, clamp, normalizeAngle } from './lib/gridfinity.js'

// ---------------------------------------------------------------------
// Global State (Zustand)
// - gridConfig: Grid-Geometrie
// - models:     Map von ModelId -> { name, geometry, triangleCount, boundingBox }
//               Nur im RAM; wird nicht persistiert (Geometrien werden beim
//               Laden aus dem Storage neu geparst).
// - placements: Array von platzierten Modellen auf dem Grid.
// - selectedId: aktuell markiertes Placement (für Drag/Rotate/Delete)
// - history:    Undo/Redo Stacks
// ---------------------------------------------------------------------

const HISTORY_LIMIT = 50

function snapshot(state) {
  // Nur veränderlicher State in die History - Geometrien sind unveränderlich.
  return {
    gridConfig: { ...state.gridConfig },
    placements: state.placements.map((p) => ({ ...p })),
    selectedId: state.selectedId,
  }
}

export const useStore = create((set, get) => ({
  gridConfig: { gridWidth: 6, gridDepth: 4, unitMm: DEFAULT_UNIT_MM },
  models: {},        // { [modelId]: { name, geometry, triangleCount, bbox, source } }
  placements: [],    // [{ id, model_id, cell_x, cell_y, rotation, color }]
  selectedId: null,
  dirty: false,      // Ungespeicherte Änderungen?

  history: { undo: [], redo: [] },

  // -------------------- History / Undo / Redo --------------------
  pushHistory() {
    set((s) => {
      const undo = [...s.history.undo, snapshot(s)]
      if (undo.length > HISTORY_LIMIT) undo.shift()
      return { history: { undo, redo: [] } }
    })
  },
  undo() {
    const { history } = get()
    if (history.undo.length === 0) return
    const prev = history.undo[history.undo.length - 1]
    const current = snapshot(get())
    set({
      ...prev,
      dirty: true,
      history: {
        undo: history.undo.slice(0, -1),
        redo: [...history.redo, current].slice(-HISTORY_LIMIT),
      },
    })
  },
  redo() {
    const { history } = get()
    if (history.redo.length === 0) return
    const next = history.redo[history.redo.length - 1]
    const current = snapshot(get())
    set({
      ...next,
      dirty: true,
      history: {
        redo: history.redo.slice(0, -1),
        undo: [...history.undo, current].slice(-HISTORY_LIMIT),
      },
    })
  },

  // -------------------- Grid --------------------
  setGridConfig(partial) {
    get().pushHistory()
    set((s) => ({
      gridConfig: { ...s.gridConfig, ...partial },
      // Platzierungen clampen oder entfernen, die außerhalb sind
      placements: s.placements.filter((p) =>
        p.cell_x < (partial.gridWidth ?? s.gridConfig.gridWidth)
        && p.cell_y < (partial.gridDepth ?? s.gridConfig.gridDepth),
      ),
      dirty: true,
    }))
  },

  // -------------------- Models (RAM-Library) --------------------
  addModel(model) {
    set((s) => ({ models: { ...s.models, [model.id]: model } }))
  },
  removeModel(id) {
    set((s) => {
      const next = { ...s.models }
      const existing = next[id]
      if (existing?.geometry?.dispose) existing.geometry.dispose()
      delete next[id]
      // Alle Platzierungen mit diesem Modell entfernen
      return {
        models: next,
        placements: s.placements.filter((p) => p.model_id !== id),
        dirty: true,
      }
    })
  },

  // -------------------- Placements --------------------
  placeModel(modelId, cellX, cellY) {
    get().pushHistory()
    set((s) => {
      const id = crypto.randomUUID()
      return {
        placements: [
          ...s.placements,
          {
            id,
            model_id: modelId,
            cell_x: cellX,
            cell_y: cellY,
            rotation: { x: 0, y: 0, z: 0 },
            color: randomColor(),
          },
        ],
        selectedId: id,
        dirty: true,
      }
    })
  },
  movePlacement(id, cellX, cellY) {
    get().pushHistory()
    set((s) => {
      const gw = s.gridConfig.gridWidth
      const gd = s.gridConfig.gridDepth
      return {
        placements: s.placements.map((p) =>
          p.id === id
            ? { ...p, cell_x: clamp(cellX, 0, gw - 1), cell_y: clamp(cellY, 0, gd - 1) }
            : p,
        ),
        dirty: true,
      }
    })
  },
  /** Relativ verschieben, z.B. via Pfeiltasten (dx, dy in Zellen). */
  movePlacementBy(id, dx, dy) {
    get().pushHistory()
    set((s) => {
      const gw = s.gridConfig.gridWidth
      const gd = s.gridConfig.gridDepth
      return {
        placements: s.placements.map((p) =>
          p.id === id
            ? {
                ...p,
                cell_x: clamp(p.cell_x + dx, 0, gw - 1),
                cell_y: clamp(p.cell_y + dy, 0, gd - 1),
              }
            : p,
        ),
        dirty: true,
      }
    })
  },
  /**
   * Axis-Rotation in 90°-Schritten.
   * axis: 'x' | 'y' | 'z', delta: typischerweise +90 oder -90.
   */
  rotatePlacementAxis(id, axis, delta = 90) {
    get().pushHistory()
    set((s) => ({
      placements: s.placements.map((p) => {
        if (p.id !== id) return p
        const rot = { ...p.rotation, [axis]: normalizeAngle((p.rotation[axis] ?? 0) + delta) }
        return { ...p, rotation: rot }
      }),
      dirty: true,
    }))
  },
  /** Convenience: Rotation um Y (historisch "drehen"). */
  rotatePlacement(id) { get().rotatePlacementAxis(id, 'y', 90) },
  recolorPlacement(id, color) {
    set((s) => ({
      placements: s.placements.map((p) =>
        p.id === id ? { ...p, color } : p,
      ),
      dirty: true,
    }))
  },
  removePlacement(id) {
    get().pushHistory()
    set((s) => ({
      placements: s.placements.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true,
    }))
  },
  selectPlacement(id) { set({ selectedId: id }) },

  // -------------------- Arrangement laden/zurücksetzen --------------------
  loadArrangement(arrangement) {
    // arrangement: { name, grid_width, grid_depth, unit_mm, placements }
    const { models } = get()
    const neededIds = new Set((arrangement.placements ?? []).map((p) => p.model_id))

    // Geometrien freigeben, die im neuen Arrangement nicht mehr referenziert werden.
    const nextModels = {}
    for (const [id, model] of Object.entries(models)) {
      if (neededIds.has(id)) {
        nextModels[id] = model
      } else {
        model.geometry?.dispose()
      }
    }

    set({
      models: nextModels,
      gridConfig: {
        gridWidth: arrangement.grid_width,
        gridDepth: arrangement.grid_depth,
        unitMm: arrangement.unit_mm,
      },
      placements: (arrangement.placements ?? []).map((p) => ({
        id: p.id ?? crypto.randomUUID(),
        model_id: p.model_id,
        cell_x: p.cell_x,
        cell_y: p.cell_y,
        // Akzeptiere sowohl neues Objekt-Format als auch altes numerisches Feld.
        rotation: typeof p.rotation === 'object' && p.rotation
          ? { x: p.rotation.x ?? 0, y: p.rotation.y ?? 0, z: p.rotation.z ?? 0 }
          : { x: 0, y: p.rotation ?? 0, z: 0 },
        color: p.color ?? '#a0a0a0',
      })),
      selectedId: null,
      dirty: false,
      history: { undo: [], redo: [] },
    })
  },

  clearAll() {
    get().pushHistory()
    set({ placements: [], selectedId: null, dirty: true })
  },

  markSaved() { set({ dirty: false }) },
}))

function randomColor() {
  const palette = ['#4f8cff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899']
  return palette[Math.floor(Math.random() * palette.length)]
}
