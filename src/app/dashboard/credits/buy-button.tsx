'use client'

import { useState } from 'react'
import { startCheckout } from '@/lib/checkout-client'
import { useT } from '@/lib/i18n-client'

export function BuyButton({ packageId, color }: { packageId: string; color: string }) {
  const [loading, setLoading] = useState(false)
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt

  async function buy() {
    setLoading(true)
    // Cupom aplicado na CouponBox fica em sessionStorage; o checkout revalida server-side.
    let couponCode: string | null = null
    try { couponCode = sessionStorage.getItem('lead_coupon') } catch {}
    const res = await startCheckout('/api/checkout', { packageId, couponCode }, { context: 'checkout_lead' })
    if (!res.ok) { alert(res.error); setLoading(false) }
  }

  return (
    <button
      onClick={buy}
      disabled={loading}
      className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
      style={{ background: color }}
    >
      {loading ? L('Redirecionando...', 'Redirecting...', 'Redirigiendo...') : L('Comprar', 'Buy', 'Comprar')}
    </button>
  )
}
