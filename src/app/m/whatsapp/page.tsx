'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { timeAgo, getInitials } from '@/lib/utils'

interface Conv { lead_id: string; lead_name: string; lead_phone: string; last_body: string; last_direction: 'in' | 'out'; last_sent_at: string; unread: number }

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileWhatsApp() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  const [convs, setConvs] = useState<Conv[] | null>(null)
  const [err, setErr] = useState(false)
  const [q, setQ] = useState('')
  const bidRef = useRef<string | null>(null)

  useEffect(() => {
    let timer: any
    fetch('/api/m/team-context', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.buyer_id) { setErr(true); return }
        bidRef.current = d.buyer_id
        const load = () => fetch(`/api/whatsapp/conversations?buyer_id=${d.buyer_id}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null)).then(j => { if (j) setConvs(j.conversations || []) }).catch(() => {})
        load()
        timer = setInterval(load, 10000)
      })
      .catch(() => setErr(true))
    return () => { if (timer) clearInterval(timer) }
  }, [])

  const shown = (convs || []).filter(c => {
    const term = q.trim().toLowerCase()
    return !term || (c.lead_name || '').toLowerCase().includes(term) || (c.lead_phone || '').includes(term)
  })

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 8, paddingBottom: 14 }}>
        <p style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800 }}>{L('Conversas', 'Chats', 'Conversaciones')}</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--m-faint)', display: 'flex' }}><MIcon name="search" size={18} /></span>
          <input className="m-input" value={q} onChange={e => setQ(e.target.value)} placeholder={L('Buscar conversa...', 'Search chat...', 'Buscar...')} style={{ paddingLeft: 40 }} />
        </div>
      </div>

      <div className="m-pad">
        {!convs && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}
        {convs && shown.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{L('Nenhuma conversa ainda.', 'No chats yet.', 'Sin conversaciones.')}</p>}

        {shown.map(c => (
          <Link key={c.lead_id} href={`/m/whatsapp/${c.lead_id}`} className="m-link m-tap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="m-av" style={{ width: 48, height: 48, fontSize: 15, background: avatarBg(c.lead_name) }}>{getInitials(c.lead_name || '?')}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lead_name || c.lead_phone}</p>
                <span className="m-faint" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(c.last_sent_at, loc)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <p className="m-muted" style={{ margin: '3px 0 0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.last_direction === 'out' ? `${L('Você', 'You', 'Tú')}: ` : ''}{c.last_body}
                </p>
                {c.unread > 0 && (
                  <span style={{ background: 'var(--m-grad)', color: '#fff', fontSize: 11, minWidth: 19, height: 19, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', fontWeight: 700, flexShrink: 0 }}>{c.unread > 99 ? '99+' : c.unread}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
