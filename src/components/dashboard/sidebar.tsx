'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

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
  const router = useRouter()
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
    <aside className="w-[260px] bg-slate-900 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6">
        <Link href="/" className="text-xl font-extrabold text-white tracking-tight">
          Lead<span className="text-blue-400">Flow</span>
        </Link>
        {type === 'admin' && (
          <span className="ml-2 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Admin</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href ||
            (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              <span className="text-lg">{link.icon}</span>
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-5 border-t border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-lg">
            {userName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{userName || 'Usuario'}</p>
            <p className="text-xs text-slate-500">{type === 'admin' ? 'Administrador' : 'Comprador'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-slate-500 hover:text-red-400 transition-colors px-1 py-1"
        >
          ← Sair da conta
        </button>
      </div>
    </aside>
  )
}
