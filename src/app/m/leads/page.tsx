'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { timeAgo, getInitials, statusLabel } from '@/lib/utils'

interface Lead { id: string; name: string; phone: string; city: string; state: string; status: string; interest: string; type: string; created_at: string }

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileLeads() {
  const t = useT()
  const loc = t._locale
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState<'all' | 'new' | 'hot' | 'sched'>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/leads?limit=100', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setLeads(d.leads || []))
      .catch(() => setErr(true))
  }, [])

  const chips: { key: typeof filter; label: string }[] = [
    { key: 'all', label: loc === 'en' ? 'All' : loc === 'es' ? 'Todos' : 'Todos' },
    { key: 'new', label: loc === 'en' ? 'New' : loc === 'es' ? 'Nuevos' : 'Novos' },
    { key: 'hot', label: loc === 'en' ? 'Hot' : loc === 'es' ? 'Calientes' : 'Quentes' },
    { key: 'sched', label: loc === 'en' ? 'Scheduled' : loc === 'es' ? 'Agendados' : 'Agendados' },
  ]

  const shown = useMemo(() => {
    let list = leads || []
    if (filter === 'new') list = list.filter(l => l.status === 'assigned')
    else if (filter === 'hot') list = list.filter(l => l.type === 'hot')
    else if (filter === 'sched') list = list.filter(l => ['meeting_set', 'appointment_set', 'scheduled', 'confirmed'].includes(l.status))
    const term = q.trim().toLowerCase()
    if (term) list = list.filter(l => (l.name || '').toLowerCase().includes(term) || (l.phone || '').includes(term) || (l.city || '').toLowerCase().includes(term))
    return list
  }, [leads, filter, q])

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, paddingBottom: 14 }}>
        <p style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800 }}>{loc === 'en' ? 'My leads' : loc === 'es' ? 'Mis leads' : 'Meus leads'}</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--m-faint)', display: 'flex' }}><MIcon name="search" size={18} /></span>
          <input className="m-input" value={q} onChange={e => setQ(e.target.value)} placeholder={loc === 'en' ? 'Search lead...' : loc === 'es' ? 'Buscar lead...' : 'Buscar lead...'} style={{ paddingLeft: 40 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13, overflowX: 'auto' }}>
          {chips.map(c => (
            <span key={c.key} className={`m-chip m-tap${filter === c.key ? ' on' : ''}`} onClick={() => setFilter(c.key)}>{c.label}</span>
          ))}
        </div>
      </div>

      <div className="m-pad">
        {!leads && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>Não consegui carregar agora.</p>}
        {leads && shown.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{loc === 'en' ? 'No leads here.' : loc === 'es' ? 'Sin leads aquí.' : 'Nenhum lead aqui.'}</p>}

        {shown.map(l => (
          <Link key={l.id} href={`/m/leads/${l.id}`} className="m-card m-link m-tap" style={{ padding: 13, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="m-av" style={{ width: 46, height: 46, fontSize: 14, background: avatarBg(l.name) }}>{getInitials(l.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
              <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[l.city, l.state].filter(Boolean).join(', ') || l.interest || '—'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="m-badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--m-muted)' }}>{statusLabel(l.status)}</span>
              <p className="m-faint" style={{ margin: '5px 0 0', fontSize: 11 }}>{timeAgo(l.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
