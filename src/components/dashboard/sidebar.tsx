'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const buyerLinks = [
  { href: '/dashboard', label: 'Visao Geral' },
  { href: '/dashboard/leads', label: 'Meus Leads' },
  { href: '/dashboard/appointments', label: 'Appointments' },
  { href: '/dashboard/credits', label: 'Creditos' },
  { href: '/dashboard/settings', label: 'Configuracoes' },
]

const adminLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/buyers', label: 'Compradores' },
  { href: '/admin/leads', label: 'Todos os Leads' },
  { href: '/admin/appointments', label: 'Fila Appointments' },
  { href: '/admin/revenue', label: 'Receita' },
  { href: '/admin/settings', label: 'Configuracoes' },
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
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <aside className="w-[220px] bg-white border-r flex flex-col" style={{ borderColor: '#eaeaea' }}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: '#eaeaea' }}>
        <Link href="/" className="text-[15px] font-bold" style={{ color: '#111' }}>
          LeadFlow
        </Link>
        {type === 'admin' && (
          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#fee', color: '#c00' }}>ADMIN</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2">
        {links.map((link) => {
          const isActive = pathname === link.href ||
            (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              className="block px-3 py-2 rounded-md text-[13px] font-medium transition-colors mb-0.5"
              style={{
                color: isActive ? '#111' : '#666',
                background: isActive ? '#fafafa' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#fafafa' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t" style={{ borderColor: '#eaeaea' }}>
        <p className="text-[13px] font-semibold truncate" style={{ color: '#111' }}>{userName || 'Usuario'}</p>
        <p className="text-[11px] mt-0.5" style={{ color: '#999' }}>{type === 'admin' ? 'Admin' : 'Comprador'}</p>
        <button onClick={handleLogout} className="text-[11px] mt-3 transition-colors" style={{ color: '#999' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#c00'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#999'}>
          Sair
        </button>
      </div>
    </aside>
  )
}
