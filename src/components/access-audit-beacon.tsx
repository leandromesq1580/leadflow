'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { Locale } from '@/lib/i18n'

/** Registra uso autenticado, no maximo uma vez por rota a cada 30 min por aba. */
export function AccessAuditBeacon({ locale }: { locale: Locale }) {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    const bucket = Math.floor(Date.now() / (30 * 60 * 1000))
    const key = `l4p-access:${pathname}:${bucket}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {}

    void fetch('/api/audit/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ path: pathname, locale }),
    }).catch(() => {})
  }, [pathname, locale])

  return null
}
