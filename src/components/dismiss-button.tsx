'use client'

import { useState } from 'react'

export function DismissButton() {
  const [loading, setLoading] = useState(false)

  async function dismiss() {
    if (!confirm('Esconder o checklist? Voce pode reativar nas configuracoes.')) return
    setLoading(true)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
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
    <button onClick={dismiss} disabled={loading} className="text-[11px] font-semibold disabled:opacity-50" style={{ color: '#94a3b8' }}>
      {loading ? '...' : 'Esconder ✕'}
    </button>
  )
}
