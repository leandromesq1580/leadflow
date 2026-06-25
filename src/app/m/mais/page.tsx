'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

export default function MobileMais() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  const items: { icon: string; label: string; href?: string }[] = [
    { icon: 'gauge', label: L('Performance', 'Performance', 'Rendimiento'), href: '/m/performance' },
    { icon: 'calendar', label: 'Appointments' },
    { icon: 'robot', label: L('Especialista AI', 'AI Specialist', 'Especialista IA') },
    { icon: 'notes', label: L('Notas', 'Notes', 'Notas'), href: '/m/notas' },
    { icon: 'template', label: 'Templates', href: '/m/templates' },
    { icon: 'bolt', label: L('Automações', 'Automations', 'Automatizaciones'), href: '/m/automacoes' },
    { icon: 'refresh', label: 'Sequences', href: '/m/sequences' },
    { icon: 'bell', label: L('Avisos', 'Reminders', 'Avisos'), href: '/m/avisos' },
    { icon: 'users', label: L('Meu time', 'My team', 'Mi equipo') },
    { icon: 'gift', label: L('Indicações', 'Referrals', 'Referidos'), href: '/m/indicacoes' },
    { icon: 'coin', label: L('Créditos & planos', 'Credits & plans', 'Créditos y planes') },
    { icon: 'settings', label: L('Configurações', 'Settings', 'Configuración'), href: '/m/config' },
  ]

  async function logout() {
    try {
      const { createBrowserClient } = await import('@supabase/ssr')
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      await supabase.auth.signOut()
    } catch {}
    try {
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
      document.cookie = `sb-${ref}-auth-token=; path=/; max-age=0; SameSite=Lax`
    } catch {}
    window.location.href = '/login'
  }

  return (
    <div className="m-pad" style={{ paddingTop: 6 }}>
      <p style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800 }}>{L('Mais', 'More', 'Más')}</p>

      <div className="m-card" style={{ padding: '6px 4px', marginBottom: 18 }}>
        {items.map((it, i) => (
          <Link key={it.label} href={it.href || `/m/em-breve?f=${encodeURIComponent(it.label)}`} className="m-link m-tap"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div className="m-icb"><MIcon name={it.icon} size={18} /></div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it.label}</span>
            <span className="m-faint" style={{ display: 'flex' }}><MIcon name="chevron" size={18} /></span>
          </Link>
        ))}
      </div>

      <button onClick={logout} className="m-tap" style={{ width: '100%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', borderRadius: 14, height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <MIcon name="logout" size={18} />{L('Sair da conta', 'Sign out', 'Cerrar sesión')}
      </button>
    </div>
  )
}
