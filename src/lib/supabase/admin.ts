import { createClient } from '@supabase/supabase-js'

// Service role client — use ONLY in server-side API routes (webhooks, admin)
// This bypasses Row Level Security
export function createAdminClient() {
  // Vercel env às vezes traz \n no fim das vars. Limpa pra evitar "Invalid JWS"
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\\n/g, '').replace(/\s+$/, '')
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/\\n/g, '').replace(/\s+$/, '')
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
