import { useMemo } from 'react'
import * as THREE from 'three'

// Single shared renderer — avoids spawning a WebGL context per model card.
const THUMB_PX = 120
let _renderer = null

function getRenderer() {
  if (_renderer) return _renderer
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_PX
  canvas.height = THUMB_PX
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  _renderer.setClearColor(0x101622, 1)
  return _renderer
}

function renderThumbnail(geometry, color) {
  const r = getRenderer()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1e8)

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const dir = new THREE.DirectionalLight(0xffffff, 0.9)
  dir.position.set(1, 2, 1.5)
  scene.add(dir)

  const mat = new THREE.MeshStandardMaterial({ color })
  const mesh = new THREE.Mesh(geometry, mat)

  const bb = geometry.boundingBox
  const center = new THREE.Vector3()
  bb.getCenter(center)
  mesh.position.set(-center.x, -center.y, -center.z)
  scene.add(mesh)

  const size = new THREE.Vector3()
  bb.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const fovRad = (45 * Math.PI) / 180
  const dist = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.6
  camera.position.set(dist * 0.7, dist * 0.55, dist * 0.7)
  camera.lookAt(0, 0, 0)
  camera.near = dist * 0.005
  camera.far = dist * 30
  camera.updateProjectionMatrix()

  r.render(scene, camera)
  const url = r.domElement.toDataURL()

  mat.dispose()
  scene.clear()
  return url
}

export default function ModelThumbnail({ geometry, color }) {
  const dataUrl = useMemo(
    () => renderThumbnail(geometry, color ?? '#4f8cff'),
    [geometry, color],
  )

  return (
    <img
      src={dataUrl}
      alt=""
      draggable={false}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
