'use client'

import { useState } from 'react'
import { startCheckout } from '@/lib/checkout-client'
import { CRM_PLAN_LIST, type CrmPlan } from '@/lib/crm-plans'
import { useT } from '@/lib/i18n-client'

function fmtMonth(n: number) { return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}` }
function fmtTotal(cents: number) { const v = cents / 100; return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}` }

export function CrmPlansGrid({ landing = false }: { landing?: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const planLabel = (plan: CrmPlan) => {
    const m: Record<string, [string, string]> = {
      mensal: ['Monthly', 'Mensual'],
      trimestral: ['Quarterly', 'Trimestral'],
      semestral: ['Semi-annual', 'Semestral'],
      anual: ['Annual', 'Anual'],
    }
    const e = m[plan.key]
    if (!e) return plan.label
    return t._locale === 'en' ? e[0] : t._locale === 'es' ? e[1] : plan.label
  }

  async function subscribe(plan: CrmPlan) {
    setLoading(plan.key)
    // Landing pública: dispara Lead no Pixel, guarda o plano e manda pro cadastro;
    // o <ResumeCheckout/> retoma a assinatura automaticamente após o login.
    if (landing) {
      try { (window as unknown as { fbq?: (a: string, b: string) => void }).fbq?.('track', 'Lead') } catch {}
      try { localStorage.setItem('l4p_plan', plan.key) } catch {}
      window.location.href = '/register'
      return
    }
    const res = await startCheckout('/api/checkout/subscription', { plan: plan.key }, { context: 'checkout_crm' })
    if (res.ok) return
    alert(res.error || L('Não foi possível iniciar o checkout.', 'Could not start checkout.', 'No se pudo iniciar el pago.'))
    setLoading(null)
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      {CRM_PLAN_LIST.map(plan => {
        const hot = !!plan.highlight
        // Bônus de leads (2026-07-23) e landing page exclusiva (2026-07-24) DESCONTINUADOS
        // pra assinatura nova — não anunciar nenhum dos dois.
        const benefits = [
          L('Acesso CRM Pro completo (pipeline, time, follow-ups)', 'Full CRM Pro access (pipeline, team, follow-ups)', 'Acceso completo al CRM Pro (pipeline, equipo, follow-ups)'),
        ]
        return (
          <div key={plan.key} className="relative rounded-2xl p-6 flex flex-col"
            style={{ background: 'var(--bg-card)', border: `${hot ? 2 : 1}px solid ${hot ? '#6366f1' : 'var(--border)'}`, boxShadow: hot ? '0 12px 32px rgba(99,102,241,0.18)' : 'none' }}>
            {hot && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide px-3 py-1 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>{L('Mais popular', 'Most popular', 'Más popular')}</span>
            )}
            <div className="text-[13px] font-bold uppercase tracking-wide" style={{ color: hot ? '#6366f1' : 'var(--fg-secondary)' }}>{planLabel(plan)}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[34px] font-extrabold leading-none" style={{ color: 'var(--fg)' }}>{fmtMonth(plan.perMonth)}</span>
              <span className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>{L('/mês', '/mo', '/mes')}</span>
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: 'var(--fg-secondary)' }}>
              {plan.months === 1
                ? L('cobrado mensalmente', 'billed monthly', 'se cobra mensualmente')
                : t._locale === 'en'
                  ? <>billed <b style={{ color: 'var(--fg-secondary)' }}>{fmtTotal(plan.amountCents)}</b> upfront every {plan.months} months</>
                  : t._locale === 'es'
                    ? <>se cobra <b style={{ color: 'var(--fg-secondary)' }}>{fmtTotal(plan.amountCents)}</b> por adelantado cada {plan.months} meses</>
                    : <>cobrado <b style={{ color: 'var(--fg-secondary)' }}>{fmtTotal(plan.amountCents)}</b> à vista a cada {plan.months} meses</>}
            </div>
            {plan.savingsPct > 0 && (
              <div className="mt-3 self-start text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: '#ecfdf5', color: '#059669' }}>
                {L(`Economia de ${plan.savingsPct}% vs mensal`, `Save ${plan.savingsPct}% vs monthly`, `Ahorra ${plan.savingsPct}% vs mensual`)}
              </div>
            )}
            <ul className="mt-4 space-y-2.5 flex-1">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: '#334155' }}>
                  <span className="font-bold" style={{ color: '#10b981' }}>✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => subscribe(plan)} disabled={!!loading}
              className="mt-5 w-full py-3 rounded-xl text-[13px] font-bold disabled:opacity-50 transition-all"
              style={hot
                ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'var(--bg-card)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
                : { background: 'var(--accent-light)', color: '#6366f1' }}>
              {loading === plan.key ? L('Redirecionando...', 'Redirecting...', 'Redirigiendo...') : L('Assinar', 'Subscribe', 'Suscribirme')}
            </button>
            <div className="mt-2 text-center text-[10px]" style={{ color: 'var(--fg-muted)' }}>{L('Renova automático · cancele quando quiser', 'Auto-renews · cancel anytime', 'Renovación automática · cancela cuando quieras')}</div>
          </div>
        )
      })}
    </div>
  )
}
