'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const buyerLinks = [
  { href: '/dashboard', label: 'Visao Geral', icon: '📊' },
  { href: '/dashboard/leads', label: 'Meus Leads', icon: '👥' },
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
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-100 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-50">
        <Link href="/" className="text-xl font-extrabold text-gray-900">
          Lead<span className="text-blue-600">Flow</span>
        </Link>
        {type === 'admin' && (
          <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">ADMIN</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href ||
            (link.href !== '/dashboard' && link.href !== '/admin' && pathname.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="text-base">{link.icon}</span>
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-gray-50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
            {userName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{userName || 'Usuario'}</p>
            <p className="text-xs text-gray-400">{type === 'admin' ? 'Administrador' : 'Comprador'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-gray-400 hover:text-red-600 transition-colors px-2"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
