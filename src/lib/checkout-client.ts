/**
 * startCheckout — ÚNICO caminho client-side pra abrir checkout (lead ou assinatura).
 *
 * Por que existe (incidente 2026-07-29): cada botão de compra fazia
 * `if (d.url) redirect; else setLoading(false)` — falha SILENCIOSA. Quando o gate de
 * aceite da política passou a devolver 412, telas sem a caixa de aceite (CrmGate,
 * TrialBanner, UpsellGate, onboarding, resume-checkout) viraram botão morto: cliente
 * clicava e nada acontecia.
 *
 * Aqui: 412 policy_required → pede o aceite na hora (com link da política) → registra →
 * RETENTA o checkout sozinho. Qualquer outro erro é mostrado ao cliente (nunca silencioso).
 * Toda superfície de compra — atual ou futura — deve usar esta função.
 */
export async function startCheckout(
  endpoint: '/api/checkout' | '/api/checkout/subscription',
  body?: Record<string, unknown>,
  opts?: { context?: string }
): Promise<{ ok: boolean; error?: string }> {
  const locale = typeof document === 'undefined' ? 'pt' : document.documentElement.lang.slice(0, 2)
  const copy = locale === 'en' ? {
    confirm: 'Before continuing, you must accept the Platform Leads & Usage Policy.\n\nIt covers the 7-day free trial, non-refundable paid subscriptions except where required by law, automatic renewal and in-platform cancellation, separate lead purchases, and exchanges only for nonexistent or invalid phone numbers and/or email addresses.\n\nFull text: lead4producers.com/politicas\n\nClick OK to accept and continue to payment.',
    required: 'Policy acceptance is required to purchase.',
    acceptanceError: 'We could not record your acceptance. Please try again.',
    checkoutError: 'We could not open checkout',
    connectionError: 'Connection error.',
  } : locale === 'es' ? {
    confirm: 'Antes de continuar, debes aceptar la Política de Leads y Uso de la Plataforma.\n\nIncluye la prueba gratuita de 7 días, la no devolución de suscripciones pagadas salvo obligación legal, la renovación automática y cancelación desde la plataforma, la compra separada de leads y cambios solo por teléfono y/o correo inexistente o inválido.\n\nTexto completo: lead4producers.com/politicas\n\nHaz clic en Aceptar para continuar al pago.',
    required: 'Debes aceptar la política para comprar.',
    acceptanceError: 'No pudimos registrar tu aceptación. Inténtalo de nuevo.',
    checkoutError: 'No pudimos abrir el pago',
    connectionError: 'Error de conexión.',
  } : {
    confirm: 'Antes de continuar, você precisa aceitar a Política de Leads e Uso da Plataforma.\n\nEla cobre os 7 dias grátis, a ausência de reembolso da assinatura paga salvo obrigação legal, a renovação automática e o cancelamento pela plataforma, a compra separada de leads e a troca somente por telefone e/ou e-mail inexistente ou inválido.\n\nTexto completo: lead4producers.com/politicas\n\nClique em OK para aceitar e seguir para o pagamento.',
    required: 'Aceite da política necessário para comprar.',
    acceptanceError: 'Não consegui registrar o aceite. Tente de novo.',
    checkoutError: 'Não consegui abrir o checkout',
    connectionError: 'Erro de conexão.',
  }
  const post = () =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })

  try {
    let res = await post()
    let data = await res.json().catch(() => ({} as any))

    // Precisa aceitar a política antes de comprar → aceite inline + retry
    if (res.status === 412 && data?.policy_required) {
      const okAceite = confirm(copy.confirm)
      if (!okAceite) return { ok: false, error: copy.required }

      const acc = await fetch('/api/policies/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: opts?.context || 'checkout_inline' }),
      })
      if (!acc.ok) return { ok: false, error: copy.acceptanceError }

      res = await post()
      data = await res.json().catch(() => ({} as any))
    }

    if (data?.url) {
      window.location.href = data.url
      return { ok: true }
    }
    return { ok: false, error: data?.error || `${copy.checkoutError} (${res.status}).` }
  } catch (e: any) {
    return { ok: false, error: e?.message || copy.connectionError }
  }
}
