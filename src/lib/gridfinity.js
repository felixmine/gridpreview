// ---------------------------------------------------------------------
// Gridfinity-Konstanten und Helferfunktionen
// Der Gridfinity-Standard von Zack Freedman nutzt 42 mm Einheiten.
// Wir erlauben dennoch custom Units falls jemand mit anderem Raster
// arbeiten will.
// ---------------------------------------------------------------------

export const DEFAULT_UNIT_MM = 42
export const BASE_HEIGHT_MM = 5   // Höhe der Grid-Platte
export const LIP_HEIGHT_MM = 0.8  // kleiner Kantenrand pro Zelle

export const GRID_LIMITS = {
  width:  { min: 1, max: 20 },
  depth:  { min: 1, max: 20 },
  unit:   { min: 10, max: 200 },
}

export const PLACEMENT_LIMITS = {
  rotations: [0, 90, 180, 270],
}

/**
 * Wandelt Grid-Zellen-Koordinaten (int) in Welt-Koordinaten (mm) um.
 * Welt-Ursprung liegt in der Mitte der Platte; Zelle (0,0) ist unten links.
 * Gibt den MITTELPUNKT der Zelle zurück (für 1×1-Placements).
 */
export function cellToWorld(cellX, cellY, { gridWidth, gridDepth, unitMm }) {
  const x = (cellX + 0.5 - gridWidth / 2) * unitMm
  const z = (cellY + 0.5 - gridDepth / 2) * unitMm
  return [x, BASE_HEIGHT_MM, z]
}

/**
 * Gibt die Welt-Koordinate der oberen-linken ECKE einer Zelle zurück.
 * Wird für Ecken-basiertes Snapping von Multi-Cell-Modellen genutzt:
 * cell_x/cell_y ist die Anker-Ecke, das Modell erstreckt sich von dort
 * in +X / +Z Richtung über seinen Cell-Span.
 */
export function cellCornerToWorld(cellX, cellY, { gridWidth, gridDepth, unitMm }) {
  const x = (cellX - gridWidth / 2) * unitMm
  const z = (cellY - gridDepth / 2) * unitMm
  return [x, BASE_HEIGHT_MM, z]
}

/**
 * Berechnet den Cell-Span eines Modells (wie viele Zellen es in X und Y belegt).
 * Basiert auf der BoundingBox-Größe im Geometry-Koordinatensystem (Z-up):
 *   Geometry X → display X (Breite)
 *   Geometry Y → display Z (Tiefe, nach -90°-X-Rotation)
 */
export function computeCellSpan(boundingBox, unitMm) {
  if (!boundingBox) return { spanX: 1, spanY: 1 }
  const fX = boundingBox.max.x - boundingBox.min.x
  const fY = boundingBox.max.y - boundingBox.min.y
  return {
    spanX: Math.max(1, Math.round(fX / unitMm)),
    spanY: Math.max(1, Math.round(fY / unitMm)),
  }
}

/**
 * Snappt eine Welt-Koordinate auf die nächste Grid-Zelle.
 * Gibt die Zell-Indizes zurück (könnten außerhalb des Grids liegen - clamped).
 */
export function worldToCell(x, z, { gridWidth, gridDepth, unitMm }) {
  const cx = Math.floor(x / unitMm + gridWidth / 2)
  const cy = Math.floor(z / unitMm + gridDepth / 2)
  return {
    cellX: clamp(cx, 0, gridWidth - 1),
    cellY: clamp(cy, 0, gridDepth - 1),
  }
}

export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

/**
 * Validiert eine Grid-Konfiguration gegen die Limits.
 * Gibt { ok: boolean, errors: string[] } zurück.
 */
export function validateGridConfig({ gridWidth, gridDepth, unitMm }) {
  const errors = []
  if (!Number.isInteger(gridWidth) || gridWidth < GRID_LIMITS.width.min || gridWidth > GRID_LIMITS.width.max)
    errors.push(`Breite muss zwischen ${GRID_LIMITS.width.min} und ${GRID_LIMITS.width.max} liegen.`)
  if (!Number.isInteger(gridDepth) || gridDepth < GRID_LIMITS.depth.min || gridDepth > GRID_LIMITS.depth.max)
    errors.push(`Tiefe muss zwischen ${GRID_LIMITS.depth.min} und ${GRID_LIMITS.depth.max} liegen.`)
  if (!Number.isFinite(unitMm) || unitMm < GRID_LIMITS.unit.min || unitMm > GRID_LIMITS.unit.max)
    errors.push(`Einheit muss zwischen ${GRID_LIMITS.unit.min} und ${GRID_LIMITS.unit.max} mm liegen.`)
  return { ok: errors.length === 0, errors }
}

/**
 * Validiert eine Platzierung. Stellt sicher, dass ein Angreifer nicht
 * beliebige Werte in die DB schreiben kann (wichtig vor dem INSERT).
 *
 * rotation ist jetzt ein Objekt {x, y, z} in 90°-Schritten, um
 * auch Z-up-Modelle orientieren zu koennen.
 */
export function validatePlacement(p, gridConfig) {
  if (!p || typeof p !== 'object') return false
  if (typeof p.model_id !== 'string' || p.model_id.length > 64) return false
  if (!Number.isInteger(p.cell_x) || p.cell_x < 0 || p.cell_x >= gridConfig.gridWidth) return false
  if (!Number.isInteger(p.cell_y) || p.cell_y < 0 || p.cell_y >= gridConfig.gridDepth) return false
  if (!p.rotation || typeof p.rotation !== 'object') return false
  for (const axis of ['x', 'y', 'z']) {
    if (!PLACEMENT_LIMITS.rotations.includes(p.rotation[axis])) return false
  }
  if (typeof p.color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(p.color)) return false
  return true
}

/** Normalisiert einen Winkel auf 0/90/180/270. */
export function normalizeAngle(a) {
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360
}
