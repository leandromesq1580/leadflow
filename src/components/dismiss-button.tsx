'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n-client'

export function DismissButton() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [loading, setLoading] = useState(false)

  async function dismiss() {
    if (!confirm(L('Esconder o checklist? Voce pode reativar nas configuracoes.', 'Hide the checklist? You can re-enable it in settings.', '¿Ocultar el checklist? Puedes reactivarlo en configuración.'))) return
    setLoading(true)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        await fetch('/api/onboarding/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_user_id: payload.sub, dismissed: true }),
        })
        window.location.reload()
      } catch {}
    }
  }

  return (
    <button onClick={dismiss} disabled={loading} className="text-[11px] font-semibold disabled:opacity-50" style={{ color: 'var(--fg-muted)' }}>
      {loading ? '...' : L('Esconder ✕', 'Hide ✕', 'Ocultar ✕')}
    </button>
  )
}
