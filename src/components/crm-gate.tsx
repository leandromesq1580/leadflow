'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/lib/i18n-client'

interface Props {
  children: React.ReactNode
  hasAccess: boolean
}

export function CrmGate({ children, hasAccess }: Props) {
  const [loading, setLoading] = useState(false)
  const t = useT()

  if (hasAccess) return <>{children}</>

  async function subscribe() {
    setLoading(true)
    const r = await fetch('/api/checkout/subscription', { method: 'POST' })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
          <span className="text-[36px]">🔒</span>
        </div>
        <h2 className="text-[22px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>{t.crmGate.title}</h2>
        <p className="text-[14px] mb-2 leading-relaxed" style={{ color: '#94a3b8' }}>{t.crmGate.subtitle}</p>
        <div className="flex items-baseline justify-center gap-1 mb-6">
          <span className="text-[36px] font-extrabold" style={{ color: '#6366f1' }}>{t.crmGate.price}</span>
          <span className="text-[14px]" style={{ color: '#94a3b8' }}>{t.crmGate.priceSub}</span>
        </div>
        <button onClick={subscribe} disabled={loading}
          className="px-8 py-3.5 rounded-xl text-[14px] font-bold text-white disabled:opacity-50 transition-all hover:shadow-lg mb-3"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
          {loading ? t.crmGate.ctaLoading : t.crmGate.cta}
        </button>
        <p className="text-[11px]" style={{ color: '#c0c8d4' }}>{t.crmGate.cancel}</p>
      </div>
    </div>
  )
}
