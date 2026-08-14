'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'
import { appointmentCanAccess, leadCanAccess } from '@/lib/crm-access'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { useRealtime } from '@/lib/use-realtime'
import { PrivacyToggle } from '@/components/dashboard/privacy-toggle'

interface SidebarProps {
  type: 'buyer' | 'admin'
  userName?: string
  isAgency?: boolean
  buyerId?: string
  crmPlan?: string
  isAdmin?: boolean
  /** Gestão de apólices: só quem foi liberado ou conectou a própria seguradora. */
  podeVerApolices?: boolean
}

function useWhatsAppUnread(buyerId?: string): number {
  const [count, setCount] = useState(0)

  const load = async () => {
    if (!buyerId) return
    try {
      const r = await fetch(`/api/whatsapp/unread?buyer_id=${buyerId}`, { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      setCount(d.total || 0)
    } catch {}
  }

  useEffect(() => {
    if (!buyerId) return
    load()
    // Fallback poll lento (30s) pra caso Realtime dê problema
    const t = setInterval(load, 30000)
    const onChange = () => load()
    if (typeof window !== 'undefined') window.addEventListener('wa-unread-changed', onChange)
    return () => {
      clearInterval(t)
      if (typeof window !== 'undefined') window.removeEventListener('wa-unread-changed', onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId])

  // Realtime: sempre que chega msg INSERT no buyer, recarrega contador.
  useRealtime(
    'whatsapp_messages',
    'INSERT',
    buyerId ? `buyer_id=eq.${buyerId}` : null,
    () => load(),
  )

  return count
}

function useUpcomingMeetings(buyerId?: string): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!buyerId) return
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`/api/appointments/upcoming?buyer_id=${buyerId}&minutes=90`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled) setCount(Array.isArray(d.events) ? d.events.length : 0)
      } catch {}
    }
    load()
    const t = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [buyerId])

  return count
}

function useCommunityUnread(buyerId?: string): number {
  const [count, setCount] = useState(0)

  const load = async () => {
    if (!buyerId) return
    try {
      const r = await fetch('/api/community/notifications?count=1', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      setCount(d.unread || 0)
    } catch {}
  }

  useEffect(() => {
    if (!buyerId) return
    load()
    // Fallback poll lento (30s) + evento disparado quando o sino é lido na Comunidade.
    const t = setInterval(load, 30000)
    const onChange = () => load()
    if (typeof window !== 'undefined') window.addEventListener('community-unread-changed', onChange)
    return () => {
      clearInterval(t)
      if (typeof window !== 'undefined') window.removeEventListener('community-unread-changed', onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId])

  // Realtime: nova notificação pro membro → recarrega o contador (best-effort; poll cobre se a tabela não estiver no realtime).
  useRealtime(
    'community_notifications',
    'INSERT',
    buyerId ? `recipient_id=eq.${buyerId}` : null,
    () => load(),
  )

  return count
}

// Lead4Pro brand mark — dark rounded tile + amber gradient bolt
function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-label="Lead4Pro">
      <defs>
        <linearGradient id={`bolt-${size}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="60" height="60" rx="14" fill="#0f172a" />
      <path d="M30 12 L18 34 L28 34 L24 50 L42 26 L32 26 L36 12 Z" fill={`url(#bolt-${size})`} />
    </svg>
  )
}

export function Sidebar({ type, userName, isAgency, buyerId, crmPlan, podeVerApolices }: SidebarProps) {
  const pathname = usePathname()
  const t = useT()
  const apptOnly = type === 'buyer' && crmPlan === 'appointment'
  const leadOnly = type === 'buyer' && crmPlan === 'lead_only'
  const waUnread = useWhatsAppUnread(type === 'buyer' ? buyerId : undefined)
  const upcomingMeetings = useUpcomingMeetings(type === 'buyer' ? buyerId : undefined)
  const communityUnread = useCommunityUnread(type === 'buyer' ? buyerId : undefined)

  // MENU AGRUPADO (reconcept Fase 1, 2026-08-14): 4 grupos por lógica de trabalho.
  // Mesmos itens e rotas de sempre — só a organização mudou (casca, não função).
  const L3 = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const buyerGroups = [
    {
      titulo: L3('Vendas', 'Sales', 'Ventas'),
      itens: [
        { href: '/dashboard', label: t.sidebar.overview, icon: '📊' },
        { href: '/dashboard/performance', label: t.sidebar.performance, icon: '📈' },
        { href: '/dashboard/calculadora', label: t._locale === 'en' ? 'Calculator' : 'Calculadora', icon: '🧮' },
        { href: '/dashboard/leads', label: t.sidebar.leads, icon: '🎯' },
        { href: '/dashboard/pipeline', label: t.sidebar.pipeline, icon: '📋' },
        // add-on vendável ($39/mês): todo mundo vê; sem assinatura cai na página de venda
        { href: '/dashboard/apolices', label: t._locale === 'en' ? 'Policy Management' : t._locale === 'es' ? 'Gestión de Pólizas' : 'Gestão de Apólices', icon: '🛡️' },
        { href: '/dashboard/appointments', label: t.sidebar.appointments, icon: '📅' },
      ],
    },
    {
      titulo: L3('Comunicação', 'Communication', 'Comunicación'),
      itens: [
        { href: '/dashboard/whatsapp', label: t.sidebar.whatsapp, icon: '💬' },
        // Roteiro + IA na ligação (add-on $49): apoio em si é opt-in
        { href: '/dashboard/roteiro', label: t._locale === 'en' ? 'Call Script' : t._locale === 'es' ? 'Guion' : 'Roteiro', icon: '📜' },
        { href: '/dashboard/ai-consult', label: t._locale === 'en' ? 'AI Specialist' : t._locale === 'es' ? 'Especialista IA' : 'Especialista AI', icon: '🤖' },
        { href: '/dashboard/templates', label: t.sidebar.templates, icon: '📝' },
        { href: '/dashboard/automations', label: t.sidebar.automations, icon: '⚡' },
        { href: '/dashboard/sequences', label: t.sidebar.sequences, icon: '🔁' },
        { href: '/dashboard/settings/notifications', label: t._locale === 'en' ? 'Reminders' : t._locale === 'es' ? 'Avisos' : 'Avisos', icon: '🔔' },
        { href: '/dashboard/notas', label: t._locale === 'en' ? 'Notes' : 'Notas', icon: '🗒️' },
      ],
    },
    {
      titulo: L3('Crescimento', 'Growth', 'Crecimiento'),
      itens: [
        { href: '/dashboard/community', label: t._locale === 'en' ? 'Community' : t._locale === 'es' ? 'Comunidad' : 'Comunidade', icon: '🤝' },
        { href: '/dashboard/treinamento', label: t._locale === 'en' ? 'Training' : t._locale === 'es' ? 'Entrenamiento' : 'Treinamento', icon: '🎓' },
        { href: '/dashboard/referral', label: t.sidebar.referral, icon: '🎁' },
      ],
    },
    {
      titulo: L3('Conta', 'Account', 'Cuenta'),
      itens: [
        { href: '/dashboard/team', label: t.sidebar.team, icon: '👥' },
        { href: '/dashboard/credits', label: t.sidebar.credits, icon: '💳' },
        { href: '/dashboard/settings', label: t.sidebar.settings, icon: '⚙️' },
      ],
    },
  ]

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/buyers', label: 'Compradores', icon: '👥' },
    { href: '/admin/leads', label: 'Todos os Leads', icon: '📋' },
    { href: '/admin/appointments', label: 'Fila Appointments', icon: '📅' },
    { href: '/admin/sms', label: 'SMS em Massa', icon: '✉️' },
    { href: '/admin/clients', label: 'Atendimento Clientes', icon: '👥' },
    { href: '/admin/ads', label: 'Meta Ads', icon: '📈' },
    { href: '/admin/revenue', label: 'Receita', icon: '💰' },
    { href: '/admin/settings', label: t.sidebar.settings, icon: '⚙️' },
  ]

  // admin continua em lista única; comprador ganha os grupos
  const grupos = type === 'admin'
    ? [{ titulo: t.sidebar.menu, itens: adminLinks }]
    : buyerGroups

  async function handleLogout() {
    const { createBrowserClient } = await import('@supabase/ssr')
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const initials = userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <aside className="w-[260px] min-h-screen flex flex-col" style={{ background: '#fff', borderRight: '1px solid #e8ecf4' }}>
      {/* Logo */}
      <div className="px-6 h-[72px] flex items-center" style={{ borderBottom: '1px solid #e8ecf4' }}>
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-[17px] font-extrabold" style={{ color: '#0f172a', letterSpacing: '-0.02em' }}>
            Lead4Pro
          </span>
          {type === 'admin' && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#fef2f2', color: '#ef4444' }}>Admin</span>
          )}
        </Link>
      </div>

      {/* Navigation — grupos por lógica de trabalho (reconcept Fase 1) */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {grupos.map((grupo, gi) => (
        <div key={grupo.titulo} className={gi > 0 ? 'mt-5' : ''}>
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>{grupo.titulo}</p>
        <div className="space-y-0.5">
          {grupo.itens.map((link) => {
            const isActive = pathname === link.href ||
              (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

            const locked = (apptOnly && !appointmentCanAccess(link.href)) || (leadOnly && !leadCanAccess(link.href))
            const showBadge = !locked && link.href === '/dashboard/whatsapp' && waUnread > 0
            const showApptBadge = !locked && link.href === '/dashboard/appointments' && upcomingMeetings > 0
            const showCommunityBadge = !locked && link.href === '/dashboard/community' && communityUnread > 0
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity"
                style={{
                  color: isActive ? '#6366f1' : '#64748b',
                  background: isActive ? '#eef2ff' : 'transparent',
                  opacity: locked ? 0.5 : 1,
                }}
                title={locked ? (t._locale === 'en' ? 'Available on the full plan' : t._locale === 'es' ? 'Disponible en el plan completo' : 'Disponível no plano completo') : undefined}
              >
                <span className="text-[16px]">{link.icon}</span>
                <span className="flex-1">{link.label}</span>
                {locked && <span className="text-[12px]" aria-label={t._locale === 'en' ? 'locked' : t._locale === 'es' ? 'bloqueado' : 'bloqueado'}>🔒</span>}
                {showBadge && (
                  <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center"
                    style={{ background: '#ef4444', minWidth: 18, height: 18, padding: '0 5px', boxShadow: '0 1px 3px rgba(239,68,68,0.35)' }}>
                    {waUnread > 99 ? '99+' : waUnread}
                  </span>
                )}
                {showApptBadge && (
                  <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center"
                    style={{ background: '#6366f1', minWidth: 18, height: 18, padding: '0 5px', boxShadow: '0 1px 3px rgba(99,102,241,0.35)' }}>
                    {upcomingMeetings > 99 ? '99+' : upcomingMeetings}
                  </span>
                )}
                {showCommunityBadge && (
                  <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center"
                    style={{ background: '#ef4444', minWidth: 18, height: 18, padding: '0 5px', boxShadow: '0 1px 3px rgba(239,68,68,0.35)' }}>
                    {communityUnread > 99 ? '99+' : communityUnread}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
        </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-5" style={{ borderTop: '1px solid #e8ecf4' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a2e' }}>{userName}</p>
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>{type === 'admin' ? t.sidebar.admin : t.sidebar.buyer}</p>
          </div>
          <LocaleSwitcher current={t._locale} />
        </div>
        <div className="mt-3">
          <PrivacyToggle />
        </div>
        <button onClick={handleLogout} className="mt-3 text-[11px] font-medium hover:text-red-500" style={{ color: '#94a3b8' }}>
          {t.sidebar.logout}
        </button>
      </div>
    </aside>
  )
}
