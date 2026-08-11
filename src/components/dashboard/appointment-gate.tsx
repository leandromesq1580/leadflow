'use client'

import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { appointmentCanAccess } from '@/lib/crm-access'
import { UpsellGate } from '@/components/upsell-gate'

/** pathname → metadados da feature pro upsell. */
const FEATURE_MAP = (L: (pt: string, en: string, es: string) => string): { prefix: string; feature: string; icon: string; tagline: string }[] => [
  { prefix: '/dashboard/performance', feature: L('Performance', 'Performance', 'Rendimiento'), icon: '📈', tagline: L('Acompanhe suas taxas de conversão e veja exatamente onde melhorar.', 'Track your conversion rates and see exactly where to improve.', 'Sigue tus tasas de conversión y mira exactamente dónde mejorar.') },
  { prefix: '/dashboard/leads', feature: L('Seus Leads', 'Your Leads', 'Tus Leads'), icon: '🎯', tagline: L('Lista completa dos seus leads com filtros, tags e histórico.', 'Your full lead list with filters, tags, and history.', 'Lista completa de tus leads con filtros, etiquetas e historial.') },
  { prefix: '/dashboard/pipeline', feature: 'Pipeline', icon: '📋', tagline: L('Arraste cada lead por estágio — do primeiro contato até o fechamento.', 'Drag each lead through every stage — from first contact to close.', 'Arrastra cada lead por cada etapa: del primer contacto al cierre.') },
  { prefix: '/dashboard/whatsapp', feature: 'WhatsApp', icon: '💬', tagline: L('Converse com os leads direto da plataforma, sem trocar de app.', 'Chat with your leads right from the platform — no app switching.', 'Habla con tus leads directo desde la plataforma, sin cambiar de app.') },
  { prefix: '/dashboard/ai-consult', feature: L('Especialista AI', 'AI Specialist', 'Especialista IA'), icon: '🤖', tagline: L('Uma IA que prioriza seus leads e te diz com quem falar primeiro.', 'An AI that ranks your leads and tells you who to call first.', 'Una IA que prioriza tus leads y te dice con quién hablar primero.') },
  { prefix: '/dashboard/templates', feature: L('Templates', 'Templates', 'Plantillas'), icon: '📝', tagline: L('Mensagens prontas que convertem, com variáveis automáticas.', 'Ready-made messages that convert, with automatic variables.', 'Mensajes listos que convierten, con variables automáticas.') },
  { prefix: '/dashboard/automations', feature: L('Automações', 'Automations', 'Automatizaciones'), icon: '⚡', tagline: L('Follow-ups que disparam sozinhos no momento certo.', 'Follow-ups that fire on their own at the right time.', 'Follow-ups que se disparan solos en el momento justo.') },
  { prefix: '/dashboard/sequences', feature: L('Sequências', 'Sequences', 'Secuencias'), icon: '🔁', tagline: L('Campanhas de contato em vários passos, no piloto automático.', 'Multi-step outreach campaigns on autopilot.', 'Campañas de contacto en varios pasos, en piloto automático.') },
  { prefix: '/dashboard/team', feature: L('Gestão de Time', 'Team Management', 'Gestión de Equipo'), icon: '👥', tagline: L('Distribua leads pra sua equipe e acompanhe cada agente.', 'Distribute leads to your team and track every agent.', 'Distribuye leads a tu equipo y sigue a cada agente.') },
  { prefix: '/dashboard/referral', feature: L('Indicações', 'Referrals', 'Referidos'), icon: '🎁', tagline: L('Indique e ganhe crédito na plataforma.', 'Refer and earn platform credit.', 'Recomienda y gana crédito en la plataforma.') },
]

interface Props {
  /** true quando o buyer é appointment-only (vem do layout server). */
  active: boolean
  children: React.ReactNode
}

export function AppointmentGate({ active, children }: Props) {
  const pathname = usePathname()
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt

  if (!active) return <>{children}</>
  if (appointmentCanAccess(pathname)) return <>{children}</>

  const match = FEATURE_MAP(L).find(f => pathname === f.prefix || pathname.startsWith(f.prefix + '/'))
  const f = match || { feature: L('Esse recurso', 'This feature', 'Esta función'), icon: '✨', tagline: L('Faz parte do plano completo do Lead4Pro.', "It's part of the Lead4Pro full plan.", 'Es parte del plan completo de Lead4Pro.') }

  return <UpsellGate feature={f.feature} icon={f.icon} tagline={f.tagline} />
}
