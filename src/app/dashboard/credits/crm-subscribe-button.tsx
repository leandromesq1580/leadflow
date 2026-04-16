'use client'

import { useState } from 'react'

export function CrmSubscribeButton() {
  const [loading, setLoading] = useState(false)

  async function subscribe() {
    setLoading(true)
    const r = await fetch('/api/checkout/subscription', { method: 'POST' })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else setLoading(false)
  }

  return (
    <button onClick={subscribe} disabled={loading}
      className="px-6 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all"
      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
      {loading ? 'Redirecionando...' : 'Assinar $99/mes'}
    </button>
  )
}
