'use client'

import { useEffect, useRef } from 'react'
import { startCheckout } from '@/lib/checkout-client'

/**
 * Retoma o checkout iniciado na landing. Quando o usuário clica "Comprar" num
 * pacote (BuyCheckoutCta), o id do pacote fica em localStorage `l4p_buy`. Ao
 * chegar LOGADO no dashboard (após cadastro / confirmação de email / onboarding),
 * este componente dispara o checkout do Stripe daquele pacote e limpa a marca.
 * Roda uma única vez. Em erro (ex: Starter já comprado), manda pra /dashboard/credits.
 */
export function ResumeCheckout() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    // Assinatura CRM (l4p_plan) tem prioridade sobre pacote de lead (l4p_buy)
    let planKey: string | null = null
    try { planKey = localStorage.getItem('l4p_plan') } catch {}
    if (planKey) {
      try { localStorage.removeItem('l4p_plan') } catch {}
      ;(async () => {
        const res = await startCheckout('/api/checkout/subscription', { plan: planKey }, { context: 'checkout_resume_crm' })
        if (!res.ok) { alert(res.error); window.location.href = '/dashboard/planos' }
      })()
      return
    }
    let pkg: string | null = null
    try { pkg = localStorage.getItem('l4p_buy') } catch {}
    if (!pkg) return
    try { localStorage.removeItem('l4p_buy') } catch {}
    ;(async () => {
      const res = await startCheckout('/api/checkout', { packageId: pkg }, { context: 'checkout_resume_lead' })
      if (!res.ok) { alert(res.error); window.location.href = '/dashboard/credits' }
    })()
  }, [])
  return null
}
