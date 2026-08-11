'use client'

import { useState } from 'react'
import { CRM_PLAN_LIST, type CrmPlan } from '@/lib/crm-plans'
import { useT } from '@/lib/i18n-client'

function fmtMonth(n: number) { return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}` }
function fmtTotal(cents: number) { const v = cents / 100; return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}` }

export function CrmChangePlan({ currentPlan }: { currentPlan: string | null }) {
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

  async function change(plan: CrmPlan) {
    if (plan.key === currentPlan || loading) return
    setLoading(plan.key)
    try {
      const r = await fetch('/api/subscription/upgrade-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.key }),
      })
      const d = await r.json()
      if (r.ok && d.url) { window.location.href = d.url; return }   // upgrade → checkout pra pagar a diferença
      if (r.ok && d.switched) { window.location.reload(); return }  // downgrade → aplicado na hora
      alert(d.error || L('Não foi possível trocar de plano.', 'Could not change your plan.', 'No se pudo cambiar el plan.'))
    } catch {
      alert(L('Falha de conexão. Tente de novo.', 'Connection failed. Try again.', 'Falla de conexión. Inténtalo de nuevo.'))
    }
    setLoading(null)
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      {CRM_PLAN_LIST.map(plan => {
        const isCurrent = plan.key === currentPlan
        return (
          <div key={plan.key} className="relative rounded-2xl p-6 flex flex-col"
            style={{ background: '#fff', border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? '#10b981' : '#e8ecf4'}`, boxShadow: isCurrent ? '0 12px 32px rgba(16,185,129,0.16)' : 'none' }}>
            {isCurrent && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide px-3 py-1 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>{L('Plano atual', 'Current plan', 'Plan actual')}</span>
            )}
            <div className="text-[13px] font-bold uppercase tracking-wide" style={{ color: isCurrent ? '#059669' : '#64748b' }}>{planLabel(plan)}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[34px] font-extrabold leading-none" style={{ color: '#1a1a2e' }}>{fmtMonth(plan.perMonth)}</span>
              <span className="text-[13px]" style={{ color: '#94a3b8' }}>{L('/mês', '/mo', '/mes')}</span>
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: '#64748b' }}>
              {plan.months === 1
                ? L('cobrado mensalmente', 'billed monthly', 'se cobra mensualmente')
                : t._locale === 'en'
                  ? <>billed <b style={{ color: '#475569' }}>{fmtTotal(plan.amountCents)}</b> upfront every {plan.months} months</>
                  : t._locale === 'es'
                    ? <>se cobra <b style={{ color: '#475569' }}>{fmtTotal(plan.amountCents)}</b> por adelantado cada {plan.months} meses</>
                    : <>cobrado <b style={{ color: '#475569' }}>{fmtTotal(plan.amountCents)}</b> à vista a cada {plan.months} meses</>}
            </div>
            {plan.savingsPct > 0 && (
              <div className="mt-3 self-start text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: '#ecfdf5', color: '#059669' }}>
                {L(`Economia de ${plan.savingsPct}% vs mensal`, `Save ${plan.savingsPct}% vs monthly`, `Ahorra ${plan.savingsPct}% vs mensual`)}
              </div>
            )}
            {/* Bônus de leads descontinuado pra assinatura nova (2026-07-23) — não anunciar. */}
            <ul className="mt-4 space-y-2.5 flex-1">
              <li className="flex items-start gap-2 text-[12.5px]" style={{ color: '#334155' }}>
                <span className="font-bold" style={{ color: '#10b981' }}>✓</span>
                <span>{L('Acesso CRM Pro completo (pipeline, time, follow-ups)', 'Full CRM Pro access (pipeline, team, follow-ups)', 'Acceso completo al CRM Pro (pipeline, equipo, follow-ups)')}</span>
              </li>
            </ul>
            <button onClick={() => change(plan)} disabled={isCurrent || !!loading}
              className="mt-5 w-full py-3 rounded-xl text-[13px] font-bold disabled:opacity-60 transition-all"
              style={isCurrent
                ? { background: '#ecfdf5', color: '#059669', cursor: 'default' }
                : { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {isCurrent ? L('Plano atual', 'Current plan', 'Plan actual') : loading === plan.key ? L('Trocando...', 'Switching...', 'Cambiando...') : L('Trocar para este', 'Switch to this plan', 'Cambiar a este')}
            </button>
          </div>
        )
      })}
    </div>
  )
}
