'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n-client'

/** Barra fixa no topo quando o admin está usando "Ver como" outro usuário. */
export function ImpersonationBanner({ name }: { name: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [busy, setBusy] = useState(false)

  async function stop() {
    setBusy(true)
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' })
    } catch {}
    window.location.href = '/admin'
  }

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2.5 mb-4 rounded-xl"
      style={{ background: 'linear-gradient(135deg, #1a1a2e, #312e81)', color: '#fff' }}
    >
      <span className="text-[13px] font-semibold">
        👁 {L('Você está vendo o sistema como', 'You are viewing the system as', 'Estás viendo el sistema como')} <strong>{name}</strong>
      </span>
      <button
        onClick={stop}
        disabled={busy}
        className="text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
        style={{ background: 'var(--bg-card)', color: '#312e81' }}
      >
        {busy ? L('Voltando…', 'Returning…', 'Volviendo…') : L('← Voltar para admin', '← Back to admin', '← Volver al admin')}
      </button>
    </div>
  )
}
