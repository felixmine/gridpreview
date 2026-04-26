import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Scheduled cleanup: deletes expired user_models rows and orphaned Storage files.
// Deploy with a daily schedule:
//   supabase functions deploy cleanup-models --schedule "0 3 * * *"
// Retention days are read from app_config (key = 'model_retention_days').
// Edit that row in the Supabase Table Editor to change the retention period.

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceKey)

  // Read configurable retention period
  const { data: cfg } = await db
    .from('app_config')
    .select('value')
    .eq('key', 'model_retention_days')
    .single()
  const days   = Math.max(1, parseInt(cfg?.value ?? '7', 10))
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()

  // Find all expired model-part records
  const { data: expired, error: fetchErr } = await db
    .from('user_models')
    .select('model_id, storage_path')
    .lt('created_at', cutoff)
  if (fetchErr) return respond(500, { error: fetchErr.message })
  if (!expired?.length) return respond(200, { deleted_records: 0, deleted_files: 0 })

  const expiredIds   = expired.map((r) => r.model_id)
  const expiredPaths = [...new Set(expired.map((r) => r.storage_path))]

  // Delete expired DB rows first
  await db.from('user_models').delete().in('model_id', expiredIds)

  // Any path still referenced by a surviving row must not be deleted
  const { data: remaining } = await db
    .from('user_models')
    .select('storage_path')
    .in('storage_path', expiredPaths)
  const alive      = new Set((remaining ?? []).map((r) => r.storage_path))
  const toDelete   = expiredPaths.filter((p) => !alive.has(p))

  if (toDelete.length) await db.storage.from('models').remove(toDelete)

  return respond(200, { deleted_records: expiredIds.length, deleted_files: toDelete.length })
})

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
