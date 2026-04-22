'use client'

import { useEffect, useRef } from 'react'

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/**
 * Realtime desativado por hora — poll fallback (5-60s) ainda funciona
 * em todos os lugares que usam esse hook.
 * Reativar: restaurar import de getBrowserSupabase + supabase.channel().
 */
export function useRealtime<T = Record<string, unknown>>(
  _table: string,
  _event: Event,
  _filter: string | null,
  onChange: (row: T, oldRow: T | null) => void,
) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  useEffect(() => {}, [_table, _event, _filter])
}
