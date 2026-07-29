'use client'

import { CrmPlansGrid } from '@/app/dashboard/planos/crm-plans-grid'
import { PolicyCheck } from '@/components/policy-check'


interface Props {
  /** Nome da feature que o usuário tentou acessar (ex: "Pipeline"). */
  feature: string
  /** Emoji/ícone da feature. */
  icon: string
  /** Frase curta do que a feature faz. */
  tagline: string
}

const PERKS = [
  { icon: '📋', title: 'Pipeline Kanban', desc: 'Arraste seus leads por estágio até fechar' },
  { icon: '💬', title: 'WhatsApp integrado', desc: 'Converse com os leads sem sair da plataforma' },
  { icon: '🤖', title: 'Especialista AI', desc: 'IA prioriza e te diz com quem falar primeiro' },
  { icon: '⚡', title: 'Automações', desc: 'Follow-up dispara sozinho no momento certo' },
  { icon: '🔁', title: 'Sequências', desc: 'Campanhas de contato em vários passos' },
  { icon: '📝', title: 'Templates', desc: 'Mensagens prontas que convertem' },
  { icon: '📈', title: 'Performance', desc: 'Veja suas taxas e onde melhorar' },
  { icon: '👥', title: 'Gestão de time', desc: 'Distribua leads pra sua equipe' },
]

export function UpsellGate({ feature, icon, tagline }: Props) {
  return (
    <div className="max-w-[760px] mx-auto py-6">
      {/* Hero: feature travada */}
      <div className="relative overflow-hidden rounded-3xl p-8 mb-6 text-center"
        style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81 60%, #4338ca)' }}>
        {/* preview "borrado" decorativo atrás */}
        <div aria-hidden className="absolute inset-0 opacity-20"
          style={{ background: 'radial-gradient(circle at 30% 20%, #a78bfa 0, transparent 40%), radial-gradient(circle at 80% 70%, #6366f1 0, transparent 45%)', filter: 'blur(8px)' }} />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#c7d2fe' }}>
            🔒 Recurso do plano completo
          </div>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[40px]"
            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}>
            {icon}
          </div>
          <h1 className="text-[26px] font-extrabold text-white mb-2">{feature} está a um clique</h1>
          <p className="text-[14px] max-w-md mx-auto" style={{ color: '#c7d2fe' }}>{tagline}</p>
        </div>
      </div>

      {/* O que vem no plano completo */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px] font-bold uppercase tracking-wider mb-4" style={{ color: '#94a3b8' }}>
          Com o plano completo você ganha
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {PERKS.map((p) => (
            <div key={p.title} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#f8f9fc' }}>
              <span className="text-[20px] leading-none mt-0.5">{p.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{p.title}</p>
                <p className="text-[12px]" style={{ color: '#64748b' }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA — 4 planos (2026-07-29): antes só o mensal $99, perdendo o upsell */}
      <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe' }}>
        <p className="text-[13px] text-center mb-1 font-bold" style={{ color: '#3730a3' }}>
          Escolha seu plano — quanto maior o compromisso, menor o valor por mês
        </p>
        <p className="text-[12.5px] text-center mb-5" style={{ color: '#4f46e5' }}>
          Desbloqueie tudo pra fechar mais.
        </p>
        <PolicyCheck context="checkout_upsell" />
        <CrmPlansGrid />
        <p className="text-[11px] mt-4 text-center" style={{ color: '#818cf8' }}>Cancele quando quiser · Sem fidelidade</p>
      </div>
    </div>
  )
}
