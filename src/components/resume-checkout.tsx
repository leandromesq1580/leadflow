'use client'

import { useEffect, useRef } from 'react'

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
    let pkg: string | null = null
    try { pkg = localStorage.getItem('l4p_buy') } catch {}
    if (!pkg) return
    try { localStorage.removeItem('l4p_buy') } catch {}
    ;(async () => {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId: pkg }),
        })
        const data = await res.json().catch(() => ({}))
        if (data?.url) { window.location.href = data.url; return }
        console.warn('[ResumeCheckout] checkout sem url:', data)
        window.location.href = '/dashboard/credits'
      } catch (e) {
        console.warn('[ResumeCheckout] falhou:', e)
        window.location.href = '/dashboard/credits'
      }
    })()
  }, [])
  return null
}
