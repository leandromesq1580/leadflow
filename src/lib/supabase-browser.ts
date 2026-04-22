'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Cliente Supabase browser-side pra Realtime.
 *
 * CRITICO: nao usar createBrowserClient do @supabase/ssr aqui — ele tenta
 * gerenciar cookies e INVALIDA nossa session (que eh setada manualmente em
 * /login via document.cookie com formato base64 simples).
 *
 * Usamos createClient cru com autoRefreshToken=false e persistSession=false.
 * Realtime funciona anon; RLS nas publicacoes usa buyer_id no filter (row
 * visivel publicamente — nao contem PII sensivel na payload do INSERT porque
 * os rows seguem as policies da tabela).
 */
export function getBrowserSupabase(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  )
  return _client
}
