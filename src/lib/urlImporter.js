import { supabase } from './supabase.js'

/**
 * @typedef {{ id: string, name: string, size: number, format: string, downloadUrl: string }} ModelFile
 * @typedef {{ platform: string, modelName: string, files: ModelFile[] }} ModelListing
 */

/**
 * Fetch the file list for a Printables or MakerWorld model page URL.
 * @param {string} pageUrl
 * @returns {Promise<ModelListing>}
 */
export async function listModelFiles(pageUrl) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('import-model', {
    body: { action: 'list', url: pageUrl },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Download a model file via the proxy Edge Function and return it as a File object
 * ready to pass to loadModelFromFile().
 * @param {string} downloadUrl
 * @param {string} filename
 * @returns {Promise<File>}
 */
export async function downloadModelFile(downloadUrl, filename) {
  if (!supabase) throw new Error('Supabase is not configured')

  // supabase.functions.invoke doesn't support raw binary — use fetch directly
  // against the Edge Function URL with the anon key.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing')

  const res = await fetch(`${supabaseUrl}/functions/v1/import-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ action: 'download', url: downloadUrl, filename }),
  })

  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try { const j = await res.json(); if (j.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }

  const buffer = await res.arrayBuffer()
  return new File([buffer], filename, { type: 'application/octet-stream' })
}
