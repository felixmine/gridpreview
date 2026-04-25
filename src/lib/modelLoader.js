import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import * as THREE from 'three'

// ---------------------------------------------------------------------
// Modell-Loader und Datei-Validierung.
// Unterstuetzte Formate:
//   - .stl   : STLLoader        (Binary oder ASCII)
//   - .obj   : OBJLoader        (Text, Mesh-Gruppen gemerged)
//   - .3mf   : ThreeMFLoader    (ZIP-XML, Mesh-Gruppen gemerged)
//   - .step, .stp : OpenCASCADE (WASM, lazy-loaded)
// Sicherheit:
//   - Dateiendung wird geprueft (whitelist)
//   - Dateigroesse wird limitiert (50 MB)
//   - Dateiname wird gegen Pfad-Traversal geprueft
//   - Geladenes Mesh wird auf Polygon-Count geprueft (DoS-Schutz)
// ---------------------------------------------------------------------

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
export const MAX_TRIANGLES = 1_500_000        // Schutz vor riesigen Meshes
export const ALLOWED_EXTENSIONS = ['.stl', '.obj', '.3mf', '.step', '.stp']

// Format-ID aus der Endung ableiten. `step` und `stp` sind dasselbe.
function formatFromExtension(ext) {
  if (ext === '.stp') return 'step'
  return ext.replace(/^\./, '')
}

export function getExtension(filename) {
  const m = /\.[^.]+$/.exec(filename.toLowerCase())
  return m ? m[0] : ''
}

export function validateFile(file) {
  const errors = []
  if (!file) { errors.push('Keine Datei ausgewählt.'); return { ok: false, errors } }

  // Name: Laengenlimit + Blockliste gefaehrlicher Zeichen.
  // Bewusst PERMISSIV: +, &, ,, ', ! etc. sind OK in Dateinamen.
  // Blockiert: Pfad-Separatoren (/ \), Null-Bytes, Control-Zeichen, .. (Traversal).
  if (file.name.length < 1 || file.name.length > 200) {
    errors.push('Dateiname ist leer oder zu lang (max. 200 Zeichen).')
  } else if (/[/\\\x00-\x1f]/.test(file.name)) {
    errors.push('Dateiname enthält ungültige Zeichen (Pfad-Separator oder Control-Zeichen).')
  } else if (/(^|[/\\])\.\.([/\\]|$)/.test(file.name)) {
    errors.push('Dateiname darf ".." nicht enthalten.')
  }

  const ext = getExtension(file.name)
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    errors.push(`Dateityp ${ext || '(unbekannt)'} nicht erlaubt. Nur ${ALLOWED_EXTENSIONS.join(', ')}.`)
  }

  if (file.size <= 0) errors.push('Datei ist leer.')
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_SIZE / 1024 / 1024} MB).`)
  }
  return { ok: errors.length === 0, errors, extension: ext, format: formatFromExtension(ext) }
}

// -------------------- einzelne Format-Loader --------------------

async function loadStl(arrayBuffer) {
  return new STLLoader().parse(arrayBuffer)
}

async function loadObj(text) {
  const group = new OBJLoader().parse(text)
  return mergeGroupToGeometry(group, 'OBJ')
}

/**
 * 3MF-Loader. Liefert ein ARRAY von Geometrien — eine pro Build-Item
 * (bzw. pro Top-Level-Objekt, falls keine <build>-Section vorhanden ist).
 * So bekommt der User in einer Multi-Part-3MF separate Library-Eintraege.
 */
async function loadThreeMfMulti(arrayBuffer) {
  // Primaer: three.js-Loader versuchen. Da er alles in eine Gruppe packt
  // und wir splitten wollen, nutzen wir ihn hier nur als "Valdierung".
  // Der Fallback-Parser gibt uns aber saubere Separation und Unit-Handling.
  try {
    return loadThreeMfFallbackMulti(arrayBuffer)
  } catch (err) {
    // Falls unser Parser scheitert, versuch den offiziellen three-Loader
    // als Notanker und gib alles als einen Eintrag zurueck.
    // eslint-disable-next-line no-console
    console.warn('[3MF] Eigener Parser fehlgeschlagen, nutze three.js-Loader:', err?.message)
    const group = new ThreeMFLoader().parse(arrayBuffer)
    return [{ name: null, geometry: mergeGroupToGeometry(group, '3MF') }]
  }
}

/**
 * Parses slicer-specific metadata files and returns a Set of object IDs that
 * represent non-model geometry (modifiers, support blockers, support enforcers).
 *
 * Handles:
 *  - Bambu Studio / Orca Slicer: Metadata/model_settings.config
 *    <part id="..." subtype="modifier|support_blocker|support_enforcer">
 */
function collectSlicerExcludedIds(files) {
  const excluded = new Set()
  const configKey = Object.keys(files).find(
    (k) => k.toLowerCase() === 'metadata/model_settings.config',
  )
  if (!configKey) return excluded
  try {
    const doc = new DOMParser().parseFromString(strFromU8(files[configKey]), 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) return excluded
    for (const part of elementsByLocalName(doc, 'part')) {
      const subtype = part.getAttribute('subtype') ?? ''
      // 'normal_part' or empty = regular geometry; anything else = skip
      if (subtype && subtype !== 'normal_part') {
        const id = part.getAttribute('id')
        if (id) excluded.add(id)
      }
    }
  } catch (_) { /* ignore — metadata is optional */ }
  return excluded
}

/** Skalierungs-Faktor einer 3MF-unit zu mm. Default laut Spec: millimeter. */
const UNIT_TO_MM = {
  micron: 0.001, micrometer: 0.001,
  millimeter: 1, mm: 1,
  centimeter: 10, cm: 10,
  inch: 25.4, in: 25.4,
  foot: 304.8, ft: 304.8,
  meter: 1000, m: 1000,
}

/**
 * Toleranter 3MF-Parser — Multi-Output:
 *  - Entpackt das ZIP und durchsucht ALLE `.model`-Dateien.
 *  - Liest alle <object> namespace-unabhaengig via localName.
 *  - Respektiert Transforms auf <build>/<item> und <component>.
 *  - Konvertiert Einheiten (micron/mm/cm/inch/foot/meter) auf mm.
 *  - Liefert EINEN Eintrag pro Build-Item (bzw. pro Top-Level-Objekt).
 *  - Ueberspringt fehlende Referenzen STILL.
 */
function loadThreeMfFallbackMulti(arrayBuffer) {
  const files = unzipSync(new Uint8Array(arrayBuffer))
  const modelKeys = Object.keys(files).filter((k) => k.toLowerCase().endsWith('.model'))
  if (modelKeys.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[3MF] Archiv-Inhalt:', Object.keys(files))
    throw new Error('3MF-Archiv enthält keine .model-Datei.')
  }

  const preferred = modelKeys.find((k) => k.toLowerCase() === '3d/3dmodel.model')
    ?? modelKeys.find((k) => k.toLowerCase().endsWith('/3dmodel.model'))
    ?? modelKeys[0]

  // Slicer-spezifische Metadaten: IDs von Modifier-Meshes, Support-Blockern etc.
  const excluded = collectSlicerExcludedIds(files)

  // Alle Objekte sammeln (aus allen .model-Dateien), damit Komponenten-Refs
  // ueber Dateigrenzen hinweg aufgeloest werden koennen.
  const objects = new Map()
  let primaryDoc = null
  let unitScale = 1

  for (const key of modelKeys) {
    const doc = new DOMParser().parseFromString(strFromU8(files[key]), 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) continue
    parse3mfDocIntoObjects(doc, objects, excluded)
    if (key === preferred) {
      primaryDoc = doc
      const modelEl = elementsByLocalName(doc, 'model')[0]
      const unit = (modelEl?.getAttribute('unit') ?? 'millimeter').toLowerCase()
      unitScale = UNIT_TO_MM[unit] ?? 1
    }
  }

  if (!primaryDoc) primaryDoc = new DOMParser().parseFromString(strFromU8(files[preferred]), 'application/xml')

  const buildEl = elementsByLocalName(primaryDoc, 'build')[0]
  const buildItems = []
  if (buildEl) {
    for (const item of childrenByLocalName(buildEl, 'item')) {
      buildItems.push({
        objectId: item.getAttribute('objectid'),
        name: item.getAttribute('p:name')
          ?? item.getAttribute('name')
          ?? null,
        transform: parse3mfMatrix(item.getAttribute('transform')),
      })
    }
  }

  const items = buildItems.length
    ? buildItems.filter((item) => !excluded.has(item.objectId))
    : Array.from(objects.keys())
        .filter((id) => !excluded.has(id))
        .map((id) => ({
          objectId: id,
          name: objects.get(id)?.name ?? null,
          transform: new THREE.Matrix4(),
        }))

  const output = []
  for (const item of items) {
    const positions = []
    accumulate3mfObject(item.objectId, item.transform, objects, positions, 0, excluded)
    if (positions.length === 0) continue

    // Unit-Skalierung anwenden (in place).
    if (unitScale !== 1) {
      for (let i = 0; i < positions.length; i++) positions[i] *= unitScale
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    output.push({
      name: item.name || `Objekt ${output.length + 1}`,
      geometry: geo,
    })
  }

  if (output.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[3MF] Diagnose:', {
      archive: Object.keys(files),
      modelFiles: modelKeys,
      parsedObjectCount: objects.size,
      buildItemCount: buildItems.length,
      unitScale,
    })
    throw new Error(
      '3MF enthält keine verwertbaren Meshes. Falls es eine Slicer-Projektdatei ist '
      + '(Bambu/Orca/Prusa), exportiere das Modell direkt als STL oder als reines 3MF.',
    )
  }
  return output
}

/** Zaehlt, wie viele Objekte aus einem XML-Dokument in die Map gekommen sind. */
function parse3mfDocIntoObjects(doc, objects, excluded) {
  let added = 0
  for (const el of elementsByLocalName(doc, 'object')) {
    const id = el.getAttribute('id')
    if (!id || objects.has(id)) continue

    // Standard 3MF type: "model" (default) = real geometry; skip support/surface/etc.
    const type = (el.getAttribute('type') ?? 'model').toLowerCase()
    if (type !== 'model') {
      excluded.add(id)
      continue
    }

    // Ein <object> hat entweder ein direktes <mesh> ODER ein <components>-Element.
    const name = el.getAttribute('name') ?? el.getAttribute('p:name') ?? null
    const meshEl = childrenByLocalName(el, 'mesh')[0]
    if (meshEl) {
      const mesh = parse3mfMesh(meshEl)
      if (mesh.indices.length > 0) {
        objects.set(id, { kind: 'mesh', mesh, name })
        added++
      }
      continue
    }
    const compsWrap = childrenByLocalName(el, 'components')[0]
    if (compsWrap) {
      const components = []
      for (const c of childrenByLocalName(compsWrap, 'component')) {
        components.push({
          objectId: c.getAttribute('objectid') ?? c.getAttribute('p:objectid'),
          transform: parse3mfMatrix(c.getAttribute('transform')),
        })
      }
      objects.set(id, { kind: 'components', components, name })
      added++
    }
  }
  return added
}

/** Namespace-agnostisches Aequivalent zu getElementsByTagName (alle Nachfahren). */
function elementsByLocalName(root, localName) {
  // `*` als Namespace matcht alle, d.h. sowohl `<object>` als auch `<m:object>`.
  return Array.from(root.getElementsByTagNameNS('*', localName))
}

/** Direkte Kinder mit bestimmtem localName (ignoriert Prefix/Namespace). */
function childrenByLocalName(parent, localName) {
  const out = []
  for (const c of parent.children) {
    if (c.localName === localName) out.push(c)
  }
  return out
}

/** Liest <vertices> und <triangles> eines <mesh>-Elements (namespace-agnostisch). */
function parse3mfMesh(meshEl) {
  const verts = []
  const vWrap = childrenByLocalName(meshEl, 'vertices')[0]
  if (vWrap) {
    for (const v of childrenByLocalName(vWrap, 'vertex')) {
      verts.push(
        Number(v.getAttribute('x')),
        Number(v.getAttribute('y')),
        Number(v.getAttribute('z')),
      )
    }
  }
  const tris = []
  const tWrap = childrenByLocalName(meshEl, 'triangles')[0]
  if (tWrap) {
    for (const t of childrenByLocalName(tWrap, 'triangle')) {
      tris.push(
        Number(t.getAttribute('v1')),
        Number(t.getAttribute('v2')),
        Number(t.getAttribute('v3')),
      )
    }
  }
  return { vertices: verts, indices: tris }
}

/**
 * Parst eine 3MF-Transform-Matrix: "m11 m12 m13 m21 m22 m23 m31 m32 m33 m41 m42 m43"
 * (row-major, Punkt als Zeilenvektor). Three.js nutzt column-major mit
 * column-vector-Konvention, deswegen transponieren wir.
 */
function parse3mfMatrix(str) {
  const m = new THREE.Matrix4()
  if (!str) return m
  const n = str.trim().split(/\s+/).map(Number)
  if (n.length !== 12 || n.some((x) => !Number.isFinite(x))) return m
  // 3MF row-major (point * M) -> three.js (M * point): transponieren
  m.set(
    n[0], n[3], n[6], n[9],
    n[1], n[4], n[7], n[10],
    n[2], n[5], n[8], n[11],
    0,    0,    0,    1,
  )
  return m
}

/**
 * Rekursive Akkumulation. Tiefen-Limit verhindert zirkulaere Referenzen.
 * `excluded` ist ein Set von Objekt-IDs, die uebersprungen werden sollen
 * (Support-Blocker, Modifier-Meshes, etc.).
 */
function accumulate3mfObject(objectId, transform, objects, positionsOut, depth, excluded) {
  if (depth > 32) return
  if (excluded.has(objectId)) return
  const obj = objects.get(objectId)
  if (!obj) return // fehlende Referenz -> still ueberspringen

  if (obj.kind === 'mesh') {
    const { vertices, indices } = obj.mesh
    const v = new THREE.Vector3()
    for (let i = 0; i < indices.length; i++) {
      const vi = indices[i] * 3
      v.set(vertices[vi], vertices[vi + 1], vertices[vi + 2])
      v.applyMatrix4(transform)
      positionsOut.push(v.x, v.y, v.z)
    }
  } else if (obj.kind === 'components') {
    for (const c of obj.components) {
      if (excluded.has(c.objectId)) continue
      const combined = new THREE.Matrix4().multiplyMatrices(transform, c.transform)
      accumulate3mfObject(c.objectId, combined, objects, positionsOut, depth + 1, excluded)
    }
  }
}

/**
 * STEP-Loader. Die OpenCASCADE-WASM-Runtime ist gross (~4-5 MB) und wird
 * erst beim ersten STEP-Upload geladen. Weitere Aufrufe nutzen den Cache.
 */
let _occtPromise = null
function getOcct() {
  if (_occtPromise) return _occtPromise
  _occtPromise = (async () => {
    const mod = await import('occt-import-js')
    const factory = mod.default ?? mod
    return await factory()
  })()
  return _occtPromise
}

async function loadStep(arrayBuffer) {
  const occt = await getOcct()
  const bytes = new Uint8Array(arrayBuffer)
  const result = occt.ReadStepFile(bytes, null)
  if (!result || !result.success) {
    throw new Error('STEP konnte nicht geparst werden. Ist die Datei gültig?')
  }

  // occt-import-js liefert mehrere Meshes. Wir mergen sie in eine Geometrie.
  const positions = []
  const normals = []
  const indices = []
  let vertexOffset = 0

  for (const m of result.meshes ?? []) {
    const pos = m.attributes?.position?.array ?? []
    const nor = m.attributes?.normal?.array ?? []
    const idx = m.index?.array ?? []

    positions.push(...pos)
    normals.push(...nor)
    for (const i of idx) indices.push(i + vertexOffset)
    vertexOffset += pos.length / 3
  }

  if (positions.length === 0) throw new Error('STEP enthält keine verwertbare Geometrie.')

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (normals.length === positions.length) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  }
  if (indices.length) {
    const IndexArray = vertexOffset > 65535 ? Uint32Array : Uint16Array
    geo.setIndex(new THREE.BufferAttribute(new IndexArray(indices), 1))
  }
  if (!geo.attributes.normal) geo.computeVertexNormals()
  return geo
}

// -------------------- Gemeinsame Mesh-Merge-Funktion --------------------

/**
 * Wandelt eine Three.js-Gruppe (mit potenziell mehreren Meshes) in eine
 * einzige BufferGeometry um. Unsere App zeigt pro Modell nur ein Mesh an,
 * deshalb wird alles gemerged.
 */
function mergeGroupToGeometry(group, formatLabel) {
  const positions = []
  const normals = []
  group.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const g = child.geometry.clone()
      g.applyMatrix4(child.matrixWorld)
      // Falls das Mesh indexed ist, toNonIndexed machen, um ein simples Merge zu ermoeglichen
      const flat = g.index ? g.toNonIndexed() : g
      const pos = flat.attributes.position?.array
      const nor = flat.attributes.normal?.array
      if (pos) positions.push(...pos)
      if (nor) normals.push(...nor)
    }
  })
  if (positions.length === 0) {
    throw new Error(`${formatLabel}-Datei enthält kein verwertbares Mesh.`)
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (normals.length === positions.length) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  } else {
    merged.computeVertexNormals()
  }
  return merged
}

// -------------------- Dispatcher --------------------

/**
 * Laedt eine Datei und gibt ein ARRAY von Modellen zurueck.
 * Bei STL/OBJ/STEP immer genau 1 Eintrag. Bei 3MF ggf. mehrere
 * (pro Build-Item oder Top-Level-Objekt einen).
 * Der Aufrufer ist fuer geometry.dispose() verantwortlich.
 */
export async function loadModelFromFile(file) {
  const v = validateFile(file)
  if (!v.ok) throw new Error(v.errors.join(' '))

  /** @type {Array<{ name: string|null, geometry: THREE.BufferGeometry }>} */
  let parts
  switch (v.format) {
    case 'stl':
      parts = [{ name: null, geometry: await loadStl(await file.arrayBuffer()) }]
      break
    case 'obj':
      parts = [{ name: null, geometry: await loadObj(await file.text()) }]
      break
    case '3mf':
      parts = await loadThreeMfMulti(await file.arrayBuffer())
      break
    case 'step':
      parts = [{ name: null, geometry: await loadStep(await file.arrayBuffer()) }]
      break
    default:
      throw new Error(`Unbekanntes Format: ${v.format}`)
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const results = []
  for (let i = 0; i < parts.length; i++) {
    const { name: partName, geometry } = parts[i]
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const triCount = geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count ?? 0) / 3

    if (triCount > MAX_TRIANGLES) {
      geometry.dispose()
      throw new Error(
        `Modell "${partName ?? baseName}" hat zu viele Dreiecke `
        + `(${triCount.toFixed(0)}, max ${MAX_TRIANGLES}). `
        + 'Bitte reduziere die Polygonzahl (Blender: Decimate Modifier).',
      )
    }

    results.push({
      name: parts.length === 1
        ? file.name
        : `${baseName} · ${partName ?? `Teil ${i + 1}`}`,
      geometry,
      triangleCount: Math.round(triCount),
      boundingBox: geometry.boundingBox.clone(),
      format: v.format,
      sizeBytes: file.size,
    })
  }
  return results
}
