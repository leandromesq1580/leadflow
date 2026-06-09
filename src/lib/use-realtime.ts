'use client'

import { useEffect, useRef } from 'react'
import { getBrowserSupabase } from './supabase-browser'

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/**
 * Hook que escuta mudanças de UMA tabela via Supabase Realtime.
 * Dispara o callback quando um row bate o filtro (server-side).
 *
 * Histórico:
 *   - d0320c6: criado.
 *   - 2dd0fbd: desativado por bug com cookie auth.
 *   - 94dab45: reativado.
 *   - 7457f24: desativado de novo — crashava no pipeline pq 2 useRealtime
 *     com mesmo (table, filter) mas event diferente (INSERT vs UPDATE)
 *     geravam o MESMO channelName -> conflito de subscribe.
 *   - agora: reativado com channelName único por (table, event, filter)
 *     + try/catch silencioso. Polling fallback (whatsapp/page.tsx 10s,
 *     pipeline 60s) garante que mesmo se Realtime falhar a UI atualiza.
 *
 * Usa createClient cru (não createBrowserClient do ssr) pra não interferir
 * com cookies auth setados manualmente em /login.
 */
export function useRealtime<T = Record<string, unknown>>(
  table: string,
  event: Event,
  filter: string | null,
  onChange: (row: T, oldRow: T | null) => void,
) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    if (!filter) return
    if (typeof window === 'undefined') return

    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>['channel']> | null = null
    try {
      const supabase = getBrowserSupabase()
      // Channel name precisa incluir EVENT — sem isso, 2 useRealtime
      // na mesma página com mesmo filtro mas events diferentes (INSERT/UPDATE)
      // colidem e crasham o pipeline.
      const channelName = `rt-${table}-${event}-${filter}`
        .replace(/[^a-zA-Z0-9-]/g, '_')
        .slice(0, 80)

      channel = supabase
        .channel(channelName)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event, schema: 'public', table, filter },
          (payload: { new: T; old: T | null }) => {
            try {
              cbRef.current(payload.new, payload.old)
            } catch (cbErr) {
              console.warn('[realtime cb error]', cbErr)
            }
          },
        )
        .subscribe()
    } catch (err) {
      console.warn('[realtime subscribe failed — polling fallback ainda ativo]', err)
    }

    return () => {
      try {
        if (channel) {
          const supabase = getBrowserSupabase()
          supabase.removeChannel(channel)
        }
      } catch {}
    }
  }, [table, event, filter])
}
