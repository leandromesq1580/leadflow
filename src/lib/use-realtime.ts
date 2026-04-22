'use client'

import { useEffect, useRef } from 'react'

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/**
 * Hook de Realtime — TEMPORARIAMENTE DESATIVADO em prod enquanto investigamos
 * interacao com o cookie auth. Os poll fallbacks ainda rodam.
 *
 * Pra reativar: restaurar a chamada supabase.channel() abaixo.
 */
export function useRealtime<T = Record<string, unknown>>(
  _table: string,
  _event: Event,
  _filter: string | null,
  onChange: (row: T, oldRow: T | null) => void,
) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  useEffect(() => {
    // no-op por enquanto
  }, [_table, _event, _filter])
}
