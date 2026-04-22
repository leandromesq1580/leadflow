'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { useRealtime } from '@/lib/use-realtime'

interface SidebarProps {
  type: 'buyer' | 'admin'
  userName?: string
  isAgency?: boolean
  buyerId?: string
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

export function Sidebar({ type, userName, isAgency, buyerId }: SidebarProps) {
  const pathname = usePathname()
  const t = useT()
  const waUnread = useWhatsAppUnread(type === 'buyer' ? buyerId : undefined)

  const buyerLinks = [
    { href: '/dashboard', label: t.sidebar.overview, icon: '📊' },
    { href: '/dashboard/performance', label: t.sidebar.performance, icon: '📈' },
    { href: '/dashboard/leads', label: t.sidebar.leads, icon: '🎯' },
    { href: '/dashboard/pipeline', label: t.sidebar.pipeline, icon: '📋' },
    { href: '/dashboard/whatsapp', label: t.sidebar.whatsapp, icon: '💬' },
    { href: '/dashboard/templates', label: t.sidebar.templates, icon: '📝' },
    { href: '/dashboard/automations', label: t.sidebar.automations, icon: '⚡' },
    { href: '/dashboard/sequences', label: t.sidebar.sequences, icon: '🔁' },
    { href: '/dashboard/appointments', label: t.sidebar.appointments, icon: '📅' },
    { href: '/dashboard/team', label: t.sidebar.team, icon: '👥' },
    { href: '/dashboard/referral', label: t.sidebar.referral, icon: '🎁' },
    { href: '/dashboard/credits', label: t.sidebar.credits, icon: '💳' },
    { href: '/dashboard/settings', label: t.sidebar.settings, icon: '⚙️' },
  ]

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/buyers', label: 'Compradores', icon: '👥' },
    { href: '/admin/leads', label: 'Todos os Leads', icon: '📋' },
    { href: '/admin/appointments', label: 'Fila Appointments', icon: '📅' },
    { href: '/admin/ads', label: 'Meta Ads', icon: '📈' },
    { href: '/admin/revenue', label: 'Receita', icon: '💰' },
    { href: '/admin/settings', label: t.sidebar.settings, icon: '⚙️' },
  ]

  const links = type === 'admin' ? adminLinks : buyerLinks

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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>{t.sidebar.menu}</p>
        <div className="space-y-0.5">
          {links.map((link) => {
            const isActive = pathname === link.href ||
              (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

            const showBadge = link.href === '/dashboard/whatsapp' && waUnread > 0
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{
                  color: isActive ? '#6366f1' : '#64748b',
                  background: isActive ? '#eef2ff' : 'transparent',
                }}
              >
                <span className="text-[16px]">{link.icon}</span>
                <span className="flex-1">{link.label}</span>
                {showBadge && (
                  <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center"
                    style={{ background: '#ef4444', minWidth: 18, height: 18, padding: '0 5px', boxShadow: '0 1px 3px rgba(239,68,68,0.35)' }}>
                    {waUnread > 99 ? '99+' : waUnread}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
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
        <button onClick={handleLogout} className="mt-3 text-[11px] font-medium hover:text-red-500" style={{ color: '#94a3b8' }}>
          {t.sidebar.logout}
        </button>
      </div>
    </aside>
  )
}
