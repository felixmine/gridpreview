import { supabase } from './supabase.js'
import { loadModelFromFile } from './modelLoader.js'
import { useStore } from '../store.js'

// Upload a model file to Storage once and record one row per parsed part in user_models.
// modelIds[i] is the store key for parts[i].
// Fire-and-forget — caller should .catch(() => {}) the returned promise.
export async function persistUpload(file, modelIds, parts, userId) {
  if (!supabase || !userId) return

  const ext = file.name.split('.').pop().toLowerCase()
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('models')
    .upload(storagePath, file)
  if (uploadErr) {
    console.warn('[persist] Storage upload failed:', uploadErr.message)
    return
  }

  const rows = modelIds.map((id, i) => ({
    model_id: id,
    user_id: userId,
    storage_path: storagePath,
    part_index: i,
    name: parts[i].name ?? file.name,
    format: ext,
    size_bytes: file.size,
  }))

  const { error: dbErr } = await supabase.from('user_models').insert(rows)
  if (dbErr) console.warn('[persist] user_models insert failed:', dbErr.message)
}

// Re-download and re-parse any model IDs referenced in an arrangement that are
// missing from the current in-RAM model map.
// Fire-and-forget — caller should .catch(() => {}) the returned promise.
export async function restoreModels(neededModelIds, userId, currentModels, addModel) {
  if (!supabase || !userId || !neededModelIds.length) return

  const missingIds = neededModelIds.filter((id) => !currentModels[id])
  if (!missingIds.length) return

  const { data: records } = await supabase
    .from('user_models')
    .select('model_id, storage_path, part_index, name, format, size_bytes')
    .in('model_id', missingIds)
    .eq('user_id', userId)
  if (!records?.length) return

  // Group by storage_path so each file is downloaded only once
  const byPath = records.reduce((acc, r) => {
    if (!acc.has(r.storage_path)) acc.set(r.storage_path, [])
    acc.get(r.storage_path).push(r)
    return acc
  }, new Map())

  for (const [storagePath, pathRecords] of byPath) {
    const { data: blob, error } = await supabase.storage
      .from('models')
      .download(storagePath)
    if (error || !blob) continue

    const file = new File([blob], pathRecords[0].name)
    let parts
    try {
      parts = await loadModelFromFile(file)
    } catch (err) {
      console.warn('[restore] parse failed:', pathRecords[0].name, err?.message)
      continue
    }

    for (const record of pathRecords) {
      const part = parts[record.part_index]
      if (!part) continue
      const placementColor = useStore.getState().placements
        .find((p) => p.model_id === record.model_id)?.color
      addModel({
        id: record.model_id,
        name: part.name ?? record.name,
        geometry: part.geometry,
        triangleCount: part.triangleCount,
        boundingBox: part.boundingBox,
        sizeBytes: record.size_bytes ?? 0,
        source: 'cloud',
        ...(placementColor && { preferredColor: placementColor }),
      })
    }
  }
}
