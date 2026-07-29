'use client'

import Link from 'next/link'
import { startCheckout } from '@/lib/checkout-client'
import { useState } from 'react'

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
  const [loading, setLoading] = useState(false)

  async function subscribe() {
    setLoading(true)
    const r = await startCheckout('/api/checkout/subscription', undefined, { context: 'checkout_upsell' })
    if (!r.ok) { alert(r.error); setLoading(false) }
  }

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

      {/* CTA */}
      <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe' }}>
        <div className="flex items-baseline justify-center gap-1 mb-1">
          <span className="text-[40px] font-extrabold" style={{ color: '#4338ca' }}>$99</span>
          <span className="text-[15px]" style={{ color: '#6366f1' }}>/mês</span>
        </div>
        <p className="text-[13px] mb-5" style={{ color: '#4f46e5' }}>
          Continue recebendo seus appointments — e desbloqueie tudo pra fechar mais.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={subscribe} disabled={loading}
            className="px-8 py-3.5 rounded-xl text-[14px] font-bold text-white disabled:opacity-50 transition-all hover:shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
            {loading ? 'Abrindo checkout…' : '🚀 Assinar plano completo'}
          </button>
          <Link href="/dashboard/credits"
            className="px-8 py-3.5 rounded-xl text-[14px] font-bold transition-all hover:shadow-sm"
            style={{ background: '#fff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
            Ver planos
          </Link>
        </div>
        <p className="text-[11px] mt-4" style={{ color: '#818cf8' }}>Cancele quando quiser · Sem fidelidade</p>
      </div>
    </div>
  )
}
