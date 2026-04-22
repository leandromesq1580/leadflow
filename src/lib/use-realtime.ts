'use client'

import { useEffect, useRef } from 'react'
import { getBrowserSupabase } from './supabase-browser'

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/**
 * Hook que escuta mudancas de UMA tabela via Supabase Realtime.
 * Dispara o callback quando um row bate o filtro (server-side).
 *
 * Usa createClient cru (nao createBrowserClient do ssr) pra nao
 * interferir com os cookies auth que o /login seta manualmente.
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
    const supabase = getBrowserSupabase()
    const channelName = `rt-${table}-${filter}`.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 80)
    const channel = supabase
      .channel(channelName)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event, schema: 'public', table, filter },
        (payload: { new: T; old: T | null }) => {
          cbRef.current(payload.new, payload.old)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, event, filter])
}
