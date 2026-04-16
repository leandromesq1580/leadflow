'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const buyerLinks = [
  { href: '/dashboard', label: 'Visao Geral', icon: '📊' },
  { href: '/dashboard/leads', label: 'Meus Leads', icon: '🎯' },
  { href: '/dashboard/appointments', label: 'Appointments', icon: '📅' },
  { href: '/dashboard/credits', label: 'Creditos', icon: '💳' },
  { href: '/dashboard/settings', label: 'Configuracoes', icon: '⚙️' },
]

const adminLinks = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/buyers', label: 'Compradores', icon: '👥' },
  { href: '/admin/leads', label: 'Todos os Leads', icon: '📋' },
  { href: '/admin/appointments', label: 'Fila Appointments', icon: '📅' },
  { href: '/admin/revenue', label: 'Receita', icon: '💰' },
  { href: '/admin/settings', label: 'Configuracoes', icon: '⚙️' },
]

interface SidebarProps {
  type: 'buyer' | 'admin'
  userName?: string
}

export function Sidebar({ type, userName }: SidebarProps) {
  const pathname = usePathname()
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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            L
          </div>
          <span className="text-[17px] font-extrabold" style={{ color: '#1a1a2e' }}>
            Lead4Producers
          </span>
          {type === 'admin' && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#fef2f2', color: '#ef4444' }}>Admin</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Menu</p>
        <div className="space-y-0.5">
          {links.map((link) => {
            const isActive = pathname === link.href ||
              (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

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
                {link.label}
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
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>{type === 'admin' ? 'Administrador' : 'Comprador'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="mt-3 text-[11px] font-medium hover:text-red-500" style={{ color: '#94a3b8' }}>
          Sair da conta
        </button>
      </div>
    </aside>
  )
}
