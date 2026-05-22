'use client'

import { usePathname } from 'next/navigation'
import { appointmentCanAccess } from '@/lib/crm-access'
import { UpsellGate } from '@/components/upsell-gate'

/** pathname → metadados da feature pro upsell. */
const FEATURE_MAP: { prefix: string; feature: string; icon: string; tagline: string }[] = [
  { prefix: '/dashboard/performance', feature: 'Performance', icon: '📈', tagline: 'Acompanhe suas taxas de conversão e veja exatamente onde melhorar.' },
  { prefix: '/dashboard/leads', feature: 'Seus Leads', icon: '🎯', tagline: 'Lista completa dos seus leads com filtros, tags e histórico.' },
  { prefix: '/dashboard/pipeline', feature: 'Pipeline', icon: '📋', tagline: 'Arraste cada lead por estágio — do primeiro contato até o fechamento.' },
  { prefix: '/dashboard/whatsapp', feature: 'WhatsApp', icon: '💬', tagline: 'Converse com os leads direto da plataforma, sem trocar de app.' },
  { prefix: '/dashboard/ai-consult', feature: 'Especialista AI', icon: '🤖', tagline: 'Uma IA que prioriza seus leads e te diz com quem falar primeiro.' },
  { prefix: '/dashboard/templates', feature: 'Templates', icon: '📝', tagline: 'Mensagens prontas que convertem, com variáveis automáticas.' },
  { prefix: '/dashboard/automations', feature: 'Automações', icon: '⚡', tagline: 'Follow-ups que disparam sozinhos no momento certo.' },
  { prefix: '/dashboard/sequences', feature: 'Sequências', icon: '🔁', tagline: 'Campanhas de contato em vários passos, no piloto automático.' },
  { prefix: '/dashboard/team', feature: 'Gestão de Time', icon: '👥', tagline: 'Distribua leads pra sua equipe e acompanhe cada agente.' },
  { prefix: '/dashboard/referral', feature: 'Indicações', icon: '🎁', tagline: 'Indique e ganhe crédito na plataforma.' },
]

interface Props {
  /** true quando o buyer é appointment-only (vem do layout server). */
  active: boolean
  children: React.ReactNode
}

export function AppointmentGate({ active, children }: Props) {
  const pathname = usePathname()

  if (!active) return <>{children}</>
  if (appointmentCanAccess(pathname)) return <>{children}</>

  const match = FEATURE_MAP.find(f => pathname === f.prefix || pathname.startsWith(f.prefix + '/'))
  const f = match || { feature: 'Esse recurso', icon: '✨', tagline: 'Faz parte do plano completo do Lead4Pro.' }

  return <UpsellGate feature={f.feature} icon={f.icon} tagline={f.tagline} />
}
