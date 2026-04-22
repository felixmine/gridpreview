import { useMemo, useRef } from 'react'
import { cellCornerToWorld, computeCellSpan, BASE_HEIGHT_MM } from '../../lib/gridfinity.js'

// ---------------------------------------------------------------------
// PlacedModel: rendert ein einzelnes hochgeladenes Mesh auf dem Grid.
//
// Koordinatensystem-Korrektur (Z-up → Y-up):
//   Die -90°-X-Rotation auf dem Mesh korrigiert CAD-Z-up → Three.js-Y-up.
//   Danach: Geometry X → local X · Geometry Y → local -Z · Geometry Z → local Y
//
// Corner-based Snapping:
//   cell_x/cell_y ist die Anker-Ecke (oben-links). Das Modell erstreckt sich
//   von dort über seinen Cell-Span (spanX × spanY). Die Gruppen-Position liegt
//   im Zentrum des belegten Zellbereichs.
//
// Scale 1:1: STL-Einheit = mm = Three.js-Einheit.
// ---------------------------------------------------------------------

export default function PlacedModel({
  placement,
  model,
  gridConfig,
  selected,
  onSelect,
  onDragStart,    // (id: string) => void
  dragPreview,    // { cellX, cellY } | null – überschreibt Position während Drag
  isDragging,     // boolean – dieses Modell wird gerade gezogen
}) {
  const groupRef = useRef()

  // Cell-Span und Zentrierung aus BoundingBox berechnen.
  // spanX/spanY: wie viele Zellen das Modell belegt.
  // xOff/yOff/zOff: Versatz im Mesh-Koordinatensystem um Footprint-Mitte
  //   auf Gruppen-Ursprung zu legen und Boden auf Y=0 zu setzen.
  const { spanX, spanY, xOff, yOff, zOff } = useMemo(() => {
    if (!model?.boundingBox) return { spanX: 1, spanY: 1, xOff: 0, yOff: 0, zOff: 0 }
    const { min, max } = model.boundingBox
    const { spanX: sX, spanY: sY } = computeCellSpan(model.boundingBox, gridConfig.unitMm)
    return {
      spanX: sX,
      spanY: sY,
      xOff: -(min.x + max.x) / 2,   // X-Zentrierung
      yOff: -min.z,                   // Boden auf Y=0 (geometry min.z → display Y)
      zOff:  (min.y + max.y) / 2,    // Z-Zentrierung (geometry Y → display -Z)
    }
  }, [model, gridConfig.unitMm])

  // Effektive Zell-Position: Drag-Preview hat Vorrang vor gespeicherter Position.
  const anchorX = dragPreview?.cellX ?? placement.cell_x
  const anchorY = dragPreview?.cellY ?? placement.cell_y

  // Gruppen-Position: Ecke der Ankerzelle + halber Span-Bereich
  const [cornerX, , cornerZ] = cellCornerToWorld(anchorX, anchorY, gridConfig)
  const groupX = cornerX + (spanX * gridConfig.unitMm) / 2
  const groupZ = cornerZ + (spanY * gridConfig.unitMm) / 2

  if (!model?.geometry) return null

  return (
    <group
      ref={groupRef}
      position={[groupX, BASE_HEIGHT_MM + 0.9, groupZ]}
      rotation={[
        (placement.rotation.x ?? 0) * (Math.PI / 180),
        (placement.rotation.y ?? 0) * (Math.PI / 180),
        (placement.rotation.z ?? 0) * (Math.PI / 180),
      ]}
    >
      <mesh
        geometry={model.geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[xOff, yOff, zOff]}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect?.(placement.id)
          onDragStart?.(placement.id)
        }}
      >
        <meshStandardMaterial
          color={placement.color}
          metalness={0.1}
          roughness={0.6}
          transparent={isDragging}
          opacity={isDragging ? 0.55 : 1}
          emissive={selected ? '#ffffff' : '#000000'}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </mesh>

      {selected && (
        // Auswahl-Rahmen überspannt den gesamten belegten Zellbereich
        <mesh position={[0, -0.45, 0]}>
          <boxGeometry args={[
            spanX * gridConfig.unitMm * 0.99,
            0.2,
            spanY * gridConfig.unitMm * 0.99,
          ]} />
          <meshBasicMaterial color="#4f8cff" transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  )
}
