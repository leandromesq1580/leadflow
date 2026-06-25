'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { timeAgo, getInitials } from '@/lib/utils'

interface RecentLead { id: string; name: string; phone: string; city: string; state: string; status: string; interest: string; created_at: string }
interface HomeData {
  first_name: string; leads_today: number; new_leads: number; total_leads: number
  remaining_credits: number; total_purchased: number; conversion_rate: number
  appointments_today: number; recent_leads: RecentLead[]
}

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileHome() {
  const t = useT()
  const loc = t._locale
  const [d, setD] = useState<HomeData | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetch('/api/home', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr(true))
  }, [])

  if (!d && !err) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 140 }}><div className="m-spin" /></div>
  }
  if (err || !d) {
    return <div className="m-pad" style={{ paddingTop: 120, textAlign: 'center' }}><p className="m-muted">Não consegui carregar agora. Puxe pra atualizar.</p></div>
  }

  const greet = loc === 'en' ? 'Hello' : loc === 'es' ? 'Hola' : 'Olá'
  const stats = [
    { icon: 'flame', label: loc === 'en' ? 'Leads today' : loc === 'es' ? 'Leads hoy' : 'Leads hoje', value: d.leads_today, href: '/m/leads' },
    { icon: 'coin', label: loc === 'en' ? 'Credits' : loc === 'es' ? 'Créditos' : 'Créditos', value: d.remaining_credits, href: '/m/em-breve?f=Cr%C3%A9ditos' },
    { icon: 'trend', label: loc === 'en' ? 'Conversion' : loc === 'es' ? 'Conversión' : 'Conversão', value: `${d.conversion_rate}%` },
    { icon: 'calendar', label: 'Appointments', value: d.appointments_today, href: '/m/em-breve?f=Appointments' },
  ]

  return (
    <div className="m-pad" style={{ paddingTop: 6 }}>
      {/* Saudação + créditos */}
      <div style={{ borderRadius: 22, padding: 18, marginBottom: 18, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 18px 40px -16px rgba(99,102,241,0.7)' }}>
        <div style={{ position: 'absolute', top: -36, right: -28, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.13)' }} />
        <div style={{ position: 'relative' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>{greet},</p>
          <p style={{ margin: '1px 0 0', fontSize: 21, fontWeight: 700, color: '#fff' }}>{d.first_name || ' '}</p>
        </div>
        <div style={{ position: 'relative', marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{d.remaining_credits}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            {loc === 'en' ? `of ${d.total_purchased} leads available` : loc === 'es' ? `de ${d.total_purchased} leads` : `de ${d.total_purchased} leads disponíveis`}
          </span>
        </div>
      </div>

      {/* Stats 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 20 }}>
        {stats.map((s, i) => {
          const inner = (
            <>
              <div className="m-icb" style={{ marginBottom: 11 }}><MIcon name={s.icon} size={18} /></div>
              <p style={{ margin: 0, fontSize: 25, fontWeight: 800 }}>{s.value}</p>
              <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{s.label}</p>
            </>
          )
          return s.href
            ? <Link key={i} href={s.href} className="m-card m-link m-tap" style={{ padding: 14 }}>{inner}</Link>
            : <div key={i} className="m-card" style={{ padding: 14 }}>{inner}</div>
        })}
      </div>

      {/* Ações rápidas */}
      <div style={{ display: 'flex', gap: 11, marginBottom: 22 }}>
        <Link href="/m/leads" className="m-link m-tap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: '#a5b4fc', display: 'flex' }}><MIcon name="target" size={18} /></span>{loc === 'en' ? 'My leads' : loc === 'es' ? 'Mis leads' : 'Meus leads'}
        </Link>
        <Link href="/m/whatsapp" className="m-link m-tap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: '#34d399', display: 'flex' }}><MIcon name="whatsapp" size={18} /></span>WhatsApp
        </Link>
      </div>

      {/* Leads recentes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{loc === 'en' ? 'Recent leads' : loc === 'es' ? 'Leads recientes' : 'Leads recentes'}</p>
        <Link href="/m/leads" style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600, textDecoration: 'none' }}>{loc === 'en' ? 'See all' : loc === 'es' ? 'Ver todos' : 'Ver todos'}</Link>
      </div>

      {d.recent_leads.length === 0 ? (
        <div className="m-card" style={{ padding: '34px 18px', textAlign: 'center' }}>
          <p className="m-muted" style={{ fontSize: 14, margin: 0 }}>{loc === 'en' ? 'No leads yet.' : loc === 'es' ? 'Aún sin leads.' : 'Nenhum lead ainda.'}</p>
        </div>
      ) : (
        d.recent_leads.map((l) => (
          <Link key={l.id} href={`/m/leads/${l.id}`} className="m-card m-link m-tap" style={{ padding: 13, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="m-av" style={{ width: 44, height: 44, fontSize: 14, background: avatarBg(l.name) }}>{getInitials(l.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
              <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[l.city, l.state].filter(Boolean).join(', ')}{l.interest ? ` · ${l.interest}` : ''}
              </p>
            </div>
            <span className="m-faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(l.created_at)}</span>
          </Link>
        ))
      )}
    </div>
  )
}
