'use client'

import { useState } from 'react'

export function BuyButton({ packageId, color }: { packageId: string; color: string }) {
  const [loading, setLoading] = useState(false)

  async function buy() {
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId }),
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
