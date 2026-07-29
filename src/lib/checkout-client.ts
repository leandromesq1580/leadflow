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
      const okAceite = confirm(
        'Antes de continuar, você precisa aceitar a Política de Leads e Uso da plataforma.\n\n' +
        'Ela cobre: entrega de leads por fila e horários, garantia de troca (14 dias / 8 dias de tentativa), ' +
        'leads frios, gravação de ligações e SMS automático, pagamentos e conduta.\n\n' +
        'Texto completo: lead4producers.com/politicas\n\n' +
        'Clique OK para aceitar e seguir para o pagamento.'
      )
      if (!okAceite) return { ok: false, error: 'Aceite da política necessário para comprar.' }

      const acc = await fetch('/api/policies/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: opts?.context || 'checkout_inline' }),
      })
      if (!acc.ok) return { ok: false, error: 'Não consegui registrar o aceite. Tente de novo.' }

      res = await post()
      data = await res.json().catch(() => ({} as any))
    }

    if (data?.url) {
      window.location.href = data.url
      return { ok: true }
    }
    return { ok: false, error: data?.error || `Não consegui abrir o checkout (erro ${res.status}).` }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro de conexão.' }
  }
}
