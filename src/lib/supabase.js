import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------
// Supabase-Client
// Erwartet die Env-Variablen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY.
// Diese werden beim Build von Vite eingebettet. Der `anon`-Key ist öffentlich
// und zeigt nur die von RLS erlaubten Daten - NIEMALS den service_role Key
// im Frontend verwenden!
// ---------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(url && anonKey)

if (!hasSupabaseConfig && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt. '
    + 'Login und Cloud-Speicherung sind deaktiviert. '
    + 'Kopiere .env.example zu .env.local und fülle die Werte aus.',
  )
}

export const supabase = hasSupabaseConfig
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Tokens im localStorage (Standard). Für höchste Sicherheit könnten
        // wir später auf httpOnly-Cookies + Server-Auth umstellen.
      },
      global: {
        headers: { 'x-client-info': 'gridfinity-preview/0.1' },
      },
    })
  : null
