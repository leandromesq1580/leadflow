'use client'

import { useState } from 'react'

export function BillingPortalButton({ className, label = 'Gerenciar assinatura' }: { className?: string; label?: string }) {
  const [loading, setLoading] = useState(false)

  async function openPortal() {
    setLoading(true)
    const r = await fetch('/api/billing/portal', { method: 'POST' })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else {
      alert(d.error || 'Erro ao abrir portal')
      setLoading(false)
    }
  }

  return (
    <button onClick={openPortal} disabled={loading}
      className={className || 'px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-50'}
      style={!className ? { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' } : undefined}>
      {loading ? 'Redirecionando...' : label}
    </button>
  )
}
