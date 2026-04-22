import { useMemo } from 'react'
import * as THREE from 'three'
import { BASE_HEIGHT_MM, LIP_HEIGHT_MM } from '../../lib/gridfinity.js'

// ---------------------------------------------------------------------
// GridBase: rendert die Gridfinity-ähnliche Grundplatte mit einzelnen
// Zellen (sichtbare Linien zwischen den 42x42-Einheiten).
// ---------------------------------------------------------------------

export default function GridBase({ gridConfig, onCellPointerDown }) {
  const { gridWidth, gridDepth, unitMm } = gridConfig

  const plateGeometry = useMemo(
    () => new THREE.BoxGeometry(gridWidth * unitMm, BASE_HEIGHT_MM, gridDepth * unitMm),
    [gridWidth, gridDepth, unitMm],
  )

  // Zellen als dünne Boxen leicht über der Platte gerendert, für den
  // visuellen "Raster"-Effekt.
  const cells = useMemo(() => {
    const list = []
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridDepth; y++) {
        const px = (x + 0.5 - gridWidth / 2) * unitMm
        const pz = (y + 0.5 - gridDepth / 2) * unitMm
        list.push({ x, y, px, pz })
      }
    }
    return list
  }, [gridWidth, gridDepth, unitMm])

  return (
    <group>
      {/* Basis-Platte */}
      <mesh
        geometry={plateGeometry}
        position={[0, BASE_HEIGHT_MM / 2, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#2a3340" metalness={0.1} roughness={0.8} />
      </mesh>

      {/* Einzelne Zellen (visueller Raster-Effekt) */}
      {cells.map((c) => (
        <mesh
          key={`${c.x}-${c.y}`}
          position={[c.px, BASE_HEIGHT_MM + LIP_HEIGHT_MM / 2, c.pz]}
          onPointerDown={(e) => {
            e.stopPropagation()
            onCellPointerDown?.(c.x, c.y, e)
          }}
        >
          <boxGeometry args={[unitMm * 0.96, LIP_HEIGHT_MM, unitMm * 0.96]} />
          <meshStandardMaterial color="#3b4656" metalness={0.05} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
