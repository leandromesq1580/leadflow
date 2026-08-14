'use client'

import { useT } from '@/lib/i18n-client'
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

const PERKS = (L: (pt: string, en: string, es: string) => string) => [
  { icon: '📋', title: L('Pipeline Kanban', 'Kanban Pipeline', 'Pipeline Kanban'), desc: L('Arraste seus leads por estágio até fechar', 'Drag your leads through each stage until you close', 'Arrastra tus leads por cada etapa hasta cerrar') },
  { icon: '💬', title: L('WhatsApp integrado', 'Built-in WhatsApp', 'WhatsApp integrado'), desc: L('Converse com os leads sem sair da plataforma', 'Chat with leads without leaving the platform', 'Habla con tus leads sin salir de la plataforma') },
  { icon: '🤖', title: L('Especialista AI', 'AI Specialist', 'Especialista IA'), desc: L('IA prioriza e te diz com quem falar primeiro', 'AI ranks your leads and tells you who to call first', 'La IA prioriza y te dice con quién hablar primero') },
  { icon: '⚡', title: L('Automações', 'Automations', 'Automatizaciones'), desc: L('Follow-up dispara sozinho no momento certo', 'Follow-ups fire on their own at the right time', 'El follow-up se dispara solo en el momento justo') },
  { icon: '🔁', title: L('Sequências', 'Sequences', 'Secuencias'), desc: L('Campanhas de contato em vários passos', 'Multi-step outreach campaigns', 'Campañas de contacto en varios pasos') },
  { icon: '📝', title: L('Templates', 'Templates', 'Plantillas'), desc: L('Mensagens prontas que convertem', 'Ready-made messages that convert', 'Mensajes listos que convierten') },
  { icon: '📈', title: L('Performance', 'Performance', 'Rendimiento'), desc: L('Veja suas taxas e onde melhorar', 'See your rates and where to improve', 'Mira tus tasas y dónde mejorar') },
  { icon: '👥', title: L('Gestão de time', 'Team management', 'Gestión de equipo'), desc: L('Distribua leads pra sua equipe', 'Distribute leads to your team', 'Distribuye leads a tu equipo') },
]

export function UpsellGate({ feature, icon, tagline }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const perks = PERKS(L)
  return (
    <div className="max-w-[760px] mx-auto py-6">
      {/* Hero: feature travada */}
      <div className="relative overflow-hidden rounded-3xl p-8 mb-6 text-center"
        style={{ background: 'linear-gradient(135deg, #190f3a, #3b1d7a 60%, #6d28d9)' }}>
        {/* preview "borrado" decorativo atrás */}
        <div aria-hidden className="absolute inset-0 opacity-20"
          style={{ background: 'radial-gradient(circle at 30% 20%, #a78bfa 0, transparent 40%), radial-gradient(circle at 80% 70%, var(--accent) 0, transparent 45%)', filter: 'blur(8px)' }} />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(139,92,246,0.35)' }}>
            {L('🔒 Recurso do plano completo', '🔒 Full-plan feature', '🔒 Función del plan completo')}
          </div>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[40px]"
            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}>
            {icon}
          </div>
          <h1 className="text-[26px] font-extrabold text-white mb-2">{feature} {L('está a um clique', 'is one click away', 'está a un clic')}</h1>
          <p className="text-[14px] max-w-md mx-auto" style={{ color: 'rgba(139,92,246,0.35)' }}>{tagline}</p>
        </div>
      </div>

      {/* O que vem no plano completo */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-[13px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--fg-muted)' }}>
          {L('Com o plano completo você ganha', 'With the full plan you get', 'Con el plan completo obtienes')}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {perks.map((p) => (
            <div key={p.title} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
              <span className="text-[20px] leading-none mt-0.5">{p.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold" style={{ color: 'var(--fg)' }}>{p.title}</p>
                <p className="text-[12px]" style={{ color: 'var(--fg-secondary)' }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA — 4 planos (2026-07-29): antes só o mensal $99, perdendo o upsell */}
      <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid rgba(139,92,246,0.35)' }}>
        <p className="text-[13px] text-center mb-1 font-bold" style={{ color: '#5b21b6' }}>
          {L('Escolha seu plano — quanto maior o compromisso, menor o valor por mês', 'Choose your plan — the longer the commitment, the lower the monthly price', 'Elige tu plan: a mayor compromiso, menor precio por mes')}
        </p>
        <p className="text-[12.5px] text-center mb-5" style={{ color: '#6d28d9' }}>
          {L('Desbloqueie tudo pra fechar mais.', 'Unlock everything to close more.', 'Desbloquea todo para cerrar más.')}
        </p>
        <PolicyCheck context="checkout_upsell" />
        <CrmPlansGrid />
        <p className="text-[11px] mt-4 text-center" style={{ color: '#a78bfa' }}>{L('Cancele quando quiser · Sem fidelidade', 'Cancel anytime · No contracts', 'Cancela cuando quieras · Sin permanencia')}</p>
      </div>
    </div>
  )
}
