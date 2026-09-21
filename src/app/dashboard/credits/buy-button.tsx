'use client'

import { useState } from 'react'
import { startCheckout } from '@/lib/checkout-client'
import { useT } from '@/lib/i18n-client'
import { usePurchaseLanguage } from './lead-purchase-options'

export function BuyButton({ packageId, color, quantity, stock }: { packageId: string; color: string; quantity?: number; stock?: Partial<Record<string, number>> }) {
  const [loading, setLoading] = useState(false)
  const t = useT()
  const leadLanguage = usePurchaseLanguage()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  // pacote frio sem estoque no idioma escolhido = esgotado (o checkout confere de novo)
  const soldOut = !!stock && !!leadLanguage && !!quantity && (stock[leadLanguage] ?? 0) < quantity

  async function buy() {
    if (!leadLanguage || loading || soldOut) return
    setLoading(true)
    // Cupom aplicado na CouponBox fica em sessionStorage; o checkout revalida server-side.
    let couponCode: string | null = null
    try { couponCode = sessionStorage.getItem('lead_coupon') } catch {}
    const res = await startCheckout('/api/checkout', { packageId, couponCode, leadLanguage }, { context: 'checkout_lead' })
    if (!res.ok) { alert(res.error); setLoading(false) }
  }

  return (
    <button
      onClick={buy}
      disabled={loading || !leadLanguage || soldOut}
      className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
      style={{ background: color }}
    >
      {loading ? L('Redirecionando...', 'Redirecting...', 'Redirigiendo...') : soldOut ? L('Esgotado neste idioma', 'Sold out in this language', 'Agotado en este idioma') : !leadLanguage
        ? L('Escolha BR ou Espanhol acima', 'Choose BR or Spanish above', 'Elige BR o Español arriba')
        : leadLanguage === 'pt' ? L('Comprar Leads BR', 'Buy BR Leads', 'Comprar Leads BR') : L('Comprar em espanhol', 'Buy Spanish Leads', 'Comprar en español')}
    </button>
  )
}
