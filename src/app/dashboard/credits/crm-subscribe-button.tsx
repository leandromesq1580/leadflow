'use client'

import { useState } from 'react'

export function CrmSubscribeButton() {
  const [loading, setLoading] = useState<'month' | 'year' | null>(null)
  const [interval, setInterval] = useState<'month' | 'year'>('month')

  async function subscribe() {
    setLoading(interval)
    const r = await fetch('/api/checkout/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval }),
    })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else setLoading(null)
  }

  const price = interval === 'year' ? '$950/ano' : '$99/mes'
  const sub = interval === 'year' ? 'Economize $238 (20% off)' : 'Cancele quando quiser'

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <button onClick={() => setInterval('month')}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all"
          style={{ background: interval === 'month' ? '#fff' : 'transparent', color: interval === 'month' ? '#6366f1' : 'rgba(255,255,255,0.7)' }}>
          Mensal
        </button>
        <button onClick={() => setInterval('year')}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all relative"
          style={{ background: interval === 'year' ? '#fff' : 'transparent', color: interval === 'year' ? '#6366f1' : 'rgba(255,255,255,0.7)' }}>
          Anual
          <span className="absolute -top-2 -right-2 text-[8px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: '#10b981', color: '#fff' }}>-20%</span>
        </button>
      </div>
      <button onClick={subscribe} disabled={!!loading}
        className="px-6 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
        {loading ? 'Redirecionando...' : `Assinar ${price}`}
      </button>
      <span className="text-[10px]" style={{ color: '#94a3b8' }}>{sub}</span>
    </div>
  )
}
