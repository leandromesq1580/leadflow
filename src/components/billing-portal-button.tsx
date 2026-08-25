'use client'

import { useState } from 'react'

export function BillingPortalButton({
  className,
  label = 'Gerenciar assinatura',
  returnPath = '/dashboard/credits',
}: {
  className?: string
  label?: string
  returnPath?: '/dashboard/credits' | '/dashboard/settings' | '/dashboard/planos' | '/m/creditos'
}) {
  const [loading, setLoading] = useState(false)

  async function openPortal() {
    setLoading(true)
    try {
      const r = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_path: returnPath }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.url) {
        window.location.href = d.url
        return
      }
      alert(d.error || 'Erro ao abrir portal')
    } catch {
      alert('Não foi possível abrir o portal de assinatura agora. Tente novamente.')
    } finally {
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
