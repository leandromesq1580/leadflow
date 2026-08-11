'use client'

import { useEffect } from 'react'

/**
 * Espelha o idioma da interface em settings (via /api/me/locale) — 1 POST por
 * mudança de idioma, por aparelho (localStorage lembra o que já foi gravado).
 * É o que faz push e WhatsApp automáticos chegarem no idioma do corretor.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    try {
      if (localStorage.getItem('l4p_locale_synced') === locale) return
      fetch('/api/me/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      }).then(r => { if (r.ok) localStorage.setItem('l4p_locale_synced', locale) }).catch(() => {})
    } catch { /* localStorage indisponível (modo privado) — tenta de novo na próxima */ }
  }, [locale])
  return null
}
