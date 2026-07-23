'use client'

import { useState } from 'react'
import { CRM_PLAN_LIST, type CrmPlan } from '@/lib/crm-plans'

function fmtMonth(n: number) { return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}` }
function fmtTotal(cents: number) { const v = cents / 100; return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}` }

export function CrmPlansGrid({ landing = false }: { landing?: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)

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
    try {
      const r = await fetch('/api/checkout/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.key }),
      })
      const d = await r.json()
      if (d.url) { window.location.href = d.url; return }
      alert(d.error || 'Não foi possível iniciar o checkout.')
    } catch {
      alert('Falha de conexão. Tente de novo.')
    }
    setLoading(null)
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      {CRM_PLAN_LIST.map(plan => {
        const hot = !!plan.highlight
        // Bônus de leads DESCONTINUADO pra assinatura nova (2026-07-23) — não anunciar.
        const benefits = [
          'Acesso CRM Pro completo (pipeline, time, follow-ups)',
        ]
        // Landing page exclusiva: só nos planos de compromisso maior — o MENSAL não tem
        if (plan.key !== 'mensal') benefits.push('Landing page exclusiva')
        return (
          <div key={plan.key} className="relative rounded-2xl p-6 flex flex-col"
            style={{ background: '#fff', border: `${hot ? 2 : 1}px solid ${hot ? '#6366f1' : '#e8ecf4'}`, boxShadow: hot ? '0 12px 32px rgba(99,102,241,0.18)' : 'none' }}>
            {hot && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide px-3 py-1 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Mais popular</span>
            )}
            <div className="text-[13px] font-bold uppercase tracking-wide" style={{ color: hot ? '#6366f1' : '#64748b' }}>{plan.label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[34px] font-extrabold leading-none" style={{ color: '#1a1a2e' }}>{fmtMonth(plan.perMonth)}</span>
              <span className="text-[13px]" style={{ color: '#94a3b8' }}>/mês</span>
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: '#64748b' }}>
              {plan.months === 1
                ? 'cobrado mensalmente'
                : <>cobrado <b style={{ color: '#475569' }}>{fmtTotal(plan.amountCents)}</b> à vista a cada {plan.months} meses</>}
            </div>
            {plan.savingsPct > 0 && (
              <div className="mt-3 self-start text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: '#ecfdf5', color: '#059669' }}>
                Economia de {plan.savingsPct}% vs mensal
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
                ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
                : { background: '#eef2ff', color: '#6366f1' }}>
              {loading === plan.key ? 'Redirecionando...' : 'Assinar'}
            </button>
            <div className="mt-2 text-center text-[10px]" style={{ color: '#94a3b8' }}>Renova automático · cancele quando quiser</div>
          </div>
        )
      })}
    </div>
  )
}
