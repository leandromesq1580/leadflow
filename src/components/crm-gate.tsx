'use client'

import { useT } from '@/lib/i18n-client'
import { CrmPlansGrid } from '@/app/dashboard/planos/crm-plans-grid'
import { PolicyCheck } from '@/components/policy-check'

interface Props {
  children: React.ReactNode
  hasAccess: boolean
}

/**
 * Tela de bloqueio das features do CRM Pro (pipeline, time, templates, performance,
 * sequências, automações, whatsapp, ai-consult — 8 páginas).
 *
 * 2026-07-29: passou a mostrar os 4 PLANOS (mensal/trimestral/semestral/anual) em vez
 * de um botão único de $99/mês. Antes, a tela de upsell mais vista do sistema vendia
 * só o plano com o maior $/mês — perdendo o upgrade pra quem fecharia semestral/anual
 * (30-40% mais barato por mês, caixa antecipado e menos churn).
 */
export function CrmGate({ children, hasAccess }: Props) {
  const t = useT()
  if (hasAccess) return <>{children}</>

  return (
    <div className="max-w-[980px] mx-auto py-6">
      <div className="text-center mb-7">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
          <span className="text-[30px]">🔒</span>
        </div>
        <h2 className="text-[24px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>{t.crmGate.title}</h2>
        <p className="text-[14px] leading-relaxed max-w-lg mx-auto" style={{ color: '#94a3b8' }}>
          {t.crmGate.subtitle}
        </p>
        <p className="text-[12.5px] font-semibold mt-3" style={{ color: '#6366f1' }}>
          Escolha o plano: quanto maior o compromisso, menor o valor por mês.
        </p>
      </div>
      <PolicyCheck context="checkout_crm_gate" />
      <CrmPlansGrid />
      <p className="text-center text-[11px] mt-5" style={{ color: '#c0c8d4' }}>{t.crmGate.cancel}</p>
    </div>
  )
}
