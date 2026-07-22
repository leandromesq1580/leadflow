'use client'

import { useState } from 'react'

export function BuyButton({ packageId, color }: { packageId: string; color: string }) {
  const [loading, setLoading] = useState(false)

  async function buy() {
    setLoading(true)
    // Cupom aplicado na CouponBox fica em sessionStorage; o checkout revalida server-side.
    let couponCode: string | null = null
    try { couponCode = sessionStorage.getItem('lead_coupon') } catch {}
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId, couponCode }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      alert('Erro: ' + JSON.stringify(data))
      setLoading(false)
    }
  }

  return (
    <button
      onClick={buy}
      disabled={loading}
      className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
      style={{ background: color }}
    >
      {loading ? 'Redirecionando...' : 'Comprar'}
    </button>
  )
}
