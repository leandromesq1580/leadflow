'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'
import { MIcon } from './icons'

function useWaUnread(buyerId?: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!buyerId) return
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`/api/whatsapp/unread?buyer_id=${buyerId}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled) setCount(d.total || 0)
      } catch {}
    }
    load()
    const t = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [buyerId])
  return count
}

export function MobileBottomNav({ buyerId, crmPlan }: { buyerId?: string; crmPlan?: string }) {
  const pathname = usePathname()
  const t = useT()
  const wa = useWaUnread(buyerId)
  const loc = t._locale

  // Esconde a nav na thread de conversa (o composer ocupa o rodapé).
  if (/^\/m\/whatsapp\/[^/]+$/.test(pathname)) return null

  const items = [
    { href: '/m', label: loc === 'en' ? 'Home' : loc === 'es' ? 'Inicio' : 'Início', icon: 'home', active: pathname === '/m' },
    { href: '/m/leads', label: 'Leads', icon: 'target', active: pathname.startsWith('/m/leads') },
    { href: '/m/pipeline', label: 'Pipeline', icon: 'columns', active: pathname.startsWith('/m/pipeline') },
    { href: '/m/whatsapp', label: 'WhatsApp', icon: 'whatsapp', active: pathname.startsWith('/m/whatsapp'), badge: wa },
    { href: '/m/mais', label: loc === 'en' ? 'More' : loc === 'es' ? 'Más' : 'Mais', icon: 'dots', active: pathname.startsWith('/m/mais') || pathname.startsWith('/m/em-breve') },
  ]

  return (
    <nav className="m-nav">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`m-ni m-tap${it.active ? ' on' : ''}`}>
          <span style={{ position: 'relative' }}>
            <MIcon name={it.icon} size={22} stroke={it.active ? 2.2 : 1.9} />
            {!!it.badge && it.badge > 0 && (
              <span className="m-ni-badge">{it.badge > 99 ? '99+' : it.badge}</span>
            )}
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
