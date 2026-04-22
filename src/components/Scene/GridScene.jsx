import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import GridBase from './GridBase.jsx'
import PlacedModel from './PlacedModel.jsx'
import { useStore } from '../../store.js'
import { worldToCell, computeCellSpan, BASE_HEIGHT_MM, clamp } from '../../lib/gridfinity.js'

// ---------------------------------------------------------------------
// DragController: läuft INNERHALB des Canvas (kann useThree nutzen).
// Registriert pointermove/pointerup auf window wenn ein Drag aktiv ist,
// und berechnet per Raycast gegen die Grid-Ebene die Zielzelle.
// ---------------------------------------------------------------------
function DragController({ active, onMove, onEnd }) {
  const { gl, raycaster, camera } = useThree()

  // Refs halten immer die aktuellen Callbacks – vermeidet stale closures
  // in den Event-Listenern, ohne den Effect jedes Render neu zu mounten.
  const onMoveRef = useRef(onMove)
  const onEndRef  = useRef(onEnd)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])
  useEffect(() => { onEndRef.current  = onEnd  }, [onEnd])

  useEffect(() => {
    if (!active) return

    const canvas = gl.domElement
    const hitPoint = new THREE.Vector3()
    // Ebene auf Höhe der Modell-Unterseite (Plattenoberkante)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BASE_HEIGHT_MM + 0.9))

    function handleMove(e) {
      const rect = canvas.getBoundingClientRect()
      const ndcX =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
      const ndcY = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera)
      if (raycaster.ray.intersectPlane(plane, hitPoint)) {
        onMoveRef.current(hitPoint.x, hitPoint.z)
      }
    }

    function handleUp() { onEndRef.current() }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup',   handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup',   handleUp)
    }
  }, [active, gl, raycaster, camera]) // nur neu mounten wenn Drag an/aus geht

  return null
}

// ---------------------------------------------------------------------
// GridScene: die komplette 3D-Ansicht.
// Tastatur-Shortcuts, Drag & Drop, Pfeiltasten-Bewegung.
// ---------------------------------------------------------------------
export default function GridScene({ pendingModelId, onPlaced }) {
  const gridConfig       = useStore((s) => s.gridConfig)
  const placements       = useStore((s) => s.placements)
  const models           = useStore((s) => s.models)
  const selectedId       = useStore((s) => s.selectedId)
  const selectPlacement  = useStore((s) => s.selectPlacement)
  const placeModel       = useStore((s) => s.placeModel)
  const removePlacement  = useStore((s) => s.removePlacement)
  const movePlacement    = useStore((s) => s.movePlacement)
  const movePlacementBy  = useStore((s) => s.movePlacementBy)
  const rotatePlacement  = useStore((s) => s.rotatePlacement)
  const undo             = useStore((s) => s.undo)
  const redo             = useStore((s) => s.redo)

  // dragState: { id, cellX, cellY } | null
  // cellX/cellY: aktuelle Ziel-Zelle während des Drags (null = noch nicht bewegt)
  const [dragState, setDragState] = useState(null)
  const dragRef = useRef(null) // sync ref für endDrag-Callback

  useEffect(() => { dragRef.current = dragState }, [dragState])

  // ----- Drag-Callbacks -----

  const startDrag = useCallback((id) => {
    setDragState({ id, cellX: null, cellY: null })
  }, [])

  const updateDrag = useCallback((worldX, worldZ) => {
    setDragState((prev) => {
      if (!prev) return null
      // Span des gezogenen Modells ermitteln für korrektes Clamping
      const placement = placements.find((p) => p.id === prev.id)
      const model     = placement ? models[placement.model_id] : null
      const { spanX, spanY } = computeCellSpan(model?.boundingBox ?? null, gridConfig.unitMm)

      // Rotation tauscht den World-Footprint: 90°/270° → X↔Z tauschen
      const yRotNorm = (((placement?.rotation.y ?? 0) % 360) + 360) % 360
      const swapped  = yRotNorm === 90 || yRotNorm === 270
      const gSpanX   = swapped ? spanY : spanX
      const gSpanZ   = swapped ? spanX : spanY

      const { cellX, cellY } = worldToCell(worldX, worldZ, gridConfig)
      return {
        ...prev,
        cellX: clamp(cellX, 0, Math.max(0, gridConfig.gridWidth  - gSpanX)),
        cellY: clamp(cellY, 0, Math.max(0, gridConfig.gridDepth - gSpanZ)),
      }
    })
  }, [placements, models, gridConfig])

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    setDragState(null)
    if (drag && drag.cellX !== null) {
      movePlacement(drag.id, drag.cellX, drag.cellY)
    }
  }, [movePlacement])

  // ----- Tastatur-Shortcuts -----

  useEffect(() => {
    function onKey(e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) { e.preventDefault(); removePlacement(selectedId) }

      } else if (e.key === 'r' || e.key === 'R') {
        if (selectedId) { e.preventDefault(); rotatePlacement(selectedId) }

      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo()

      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); redo()

      } else if (e.key === 'Escape') {
        selectPlacement(null)

      } else if (e.key === 'ArrowLeft') {
        if (selectedId) { e.preventDefault(); movePlacementBy(selectedId, -1,  0) }
      } else if (e.key === 'ArrowRight') {
        if (selectedId) { e.preventDefault(); movePlacementBy(selectedId,  1,  0) }
      } else if (e.key === 'ArrowUp') {
        if (selectedId) { e.preventDefault(); movePlacementBy(selectedId,  0, -1) }
      } else if (e.key === 'ArrowDown') {
        if (selectedId) { e.preventDefault(); movePlacementBy(selectedId,  0,  1) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, removePlacement, rotatePlacement, undo, redo, selectPlacement, movePlacementBy])

  // ----- Zell-Klick: platzieren oder per Klick verschieben -----

  const handleCellClick = (cellX, cellY) => {
    if (dragState) return // Drag läuft – Zellklick ignorieren
    if (pendingModelId) {
      placeModel(pendingModelId, cellX, cellY)
      onPlaced?.()
    } else if (selectedId) {
      movePlacement(selectedId, cellX, cellY)
    } else {
      selectPlacement(null)
    }
  }

  // Kamera-Distanz abhängig von Grid-Größe
  const gridDiag = Math.sqrt(
    (gridConfig.gridWidth  * gridConfig.unitMm) ** 2
    + (gridConfig.gridDepth * gridConfig.unitMm) ** 2,
  )
  const camDist = Math.max(300, gridDiag * 0.9)

  return (
    <Canvas
      shadows
      camera={{ position: [camDist * 0.7, camDist * 0.7, camDist * 0.7], fov: 45, near: 1, far: 5000 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onPointerMissed={() => { if (!dragState) selectPlacement(null) }}
    >
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#9cb5d9', '#111418', 0.45]} />
      <directionalLight
        position={[200, 400, 200]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-300, 300, -200]} intensity={0.35} />

      {/* DragController muss innerhalb des Canvas stehen (nutzt useThree) */}
      <DragController
        active={!!dragState}
        onMove={updateDrag}
        onEnd={endDrag}
      />

      <Suspense fallback={null}>
        <GridBase gridConfig={gridConfig} onCellPointerDown={handleCellClick} />
        {placements.map((p) => (
          <PlacedModel
            key={p.id}
            placement={p}
            model={models[p.model_id]}
            gridConfig={gridConfig}
            selected={selectedId === p.id}
            onSelect={selectPlacement}
            onDragStart={startDrag}
            dragPreview={
              dragState?.id === p.id && dragState.cellX !== null
                ? { cellX: dragState.cellX, cellY: dragState.cellY }
                : null
            }
            isDragging={dragState?.id === p.id}
          />
        ))}
      </Suspense>

      {/* OrbitControls während Drag deaktivieren */}
      <OrbitControls
        makeDefault
        enabled={!dragState}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={50}
        maxDistance={3000}
      />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#f87171', '#86efac', '#93c5fd']} labelColor="#111" />
      </GizmoHelper>
    </Canvas>
  )
}
