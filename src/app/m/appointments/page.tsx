'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Ev { id: string; kind: string; title: string; subtitle?: string; start: string; status?: string; lead_id?: string | null; lead_name?: string | null; color?: string; completed?: boolean }

export default function MobileAppointments() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [err, setErr] = useState(false)
  const [creating, setCreating] = useState<{ title: string; date: string; time: string; color: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (bid: string) => {
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + 30 * 86400000)
    return fetch(`/api/appointments/calendar?buyer_id=${bid}&from=${from.toISOString()}&to=${to.toISOString()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setEvents((d.events || []).filter((e: Ev) => !e.completed)) }).catch(() => setErr(true))
  }

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.buyer_id) { setBuyerId(d.buyer_id); load(d.buyer_id) } else setErr(true) }).catch(() => setErr(true))
  }, [])

  const locale = loc === 'en' ? 'en-US' : loc === 'es' ? 'es' : 'pt-BR'
  const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayLabel = (iso: string) => {
    const d = new Date(iso); const dd = new Date(d); dd.setHours(0, 0, 0, 0)
    const diff = Math.round((dd.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return L('Hoje', 'Today', 'Hoy')
    if (diff === 1) return L('Amanhã', 'Tomorrow', 'Mañana')
    return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })
  }
  const kindIcon = (k: string) => k === 'followup' ? 'refresh' : k === 'calendar_item' ? 'calendar' : 'calendar'

  // agrupa por dia preservando ordem cronológica
  const groups: { label: string; items: Ev[] }[] = []
  for (const e of (events || [])) {
    const lbl = dayLabel(e.start)
    let g = groups.find(x => x.label === lbl)
    if (!g) { g = { label: lbl, items: [] }; groups.push(g) }
    g.items.push(e)
  }

  async function createEvent() {
    if (!creating || busy || !creating.title.trim() || !creating.date || !creating.time) return
    setBusy(true)
    try {
      const start_at = new Date(`${creating.date}T${creating.time}:00`).toISOString()
      await fetch('/api/calendar-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'event', title: creating.title, start_at, color: creating.color }) })
      if (buyerId) await load(buyerId)
      setCreating(null)
    } catch {}
    setBusy(false)
  }

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{t.sidebar.appointments}</p>
        <button onClick={() => setCreating({ title: '', date: '', time: '', color: '#10b981' })} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="plus" size={24} /></button>
      </div>

      <div className="m-pad" style={{ paddingTop: 6 }}>
        {!events && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}
        {events && events.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 50 }}>
            <div className="m-icb" style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 16px' }}><MIcon name="calendar" size={26} /></div>
            <p className="m-muted" style={{ fontSize: 14 }}>{L('Nada agendado nos próximos 30 dias.', 'Nothing scheduled in the next 30 days.', 'Nada agendado.')}</p>
          </div>
        )}

        {groups.map(g => (
          <div key={g.label} style={{ marginBottom: 8 }}>
            <p style={{ margin: '6px 0 11px', fontSize: 12, fontWeight: 700, color: 'rgba(243,243,248,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{g.label}</p>
            {g.items.map(e => {
              const inner = (
                <div className="m-card" style={{ padding: 14, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div style={{ textAlign: 'center', minWidth: 46 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#a5b4fc' }}>{hhmm(e.start)}</p>
                  </div>
                  <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 999, background: e.color || '#6366f1' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                    {e.subtitle && <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subtitle}</p>}
                  </div>
                  <span style={{ color: 'var(--m-faint)', display: 'flex' }}><MIcon name={kindIcon(e.kind)} size={18} /></span>
                </div>
              )
              return e.lead_id ? <Link key={e.id} href={`/m/leads/${e.lead_id}`} className="m-link m-tap">{inner}</Link> : <div key={e.id}>{inner}</div>
            })}
          </div>
        ))}
      </div>

      {creating && (
        <div className="m-sheet-ov" onClick={() => setCreating(null)}>
          <div className="m-sheet" onClick={ev => ev.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 14px', fontSize: 15, fontWeight: 700 }}>{L('Novo evento', 'New event', 'Nuevo evento')}</p>
            <input className="m-input" value={creating.title} onChange={e => setCreating({ ...creating, title: e.target.value })} placeholder={L('Título', 'Title', 'Título')} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}><p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Data', 'Date', 'Fecha')}</p><input type="date" value={creating.date} onChange={e => setCreating({ ...creating, date: e.target.value })} className="m-input" style={{ colorScheme: 'dark', height: 44 }} /></div>
              <div style={{ flex: 1 }}><p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Hora', 'Time', 'Hora')}</p><input type="time" value={creating.time} onChange={e => setCreating({ ...creating, time: e.target.value })} className="m-input" style={{ colorScheme: 'dark', height: 44 }} /></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>{L('Cor', 'Color', 'Color')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {['#0ea5e9', '#10b981', '#6366f1', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'].map(c => (
                  <button key={c} type="button" onClick={() => setCreating({ ...creating, color: c })} aria-label={c}
                    style={{ width: 28, height: 28, borderRadius: 999, background: c, border: 'none', cursor: 'pointer', boxShadow: creating.color === c ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none', transform: creating.color === c ? 'scale(1.12)' : 'scale(1)', transition: 'all .12s' }} />
                ))}
              </div>
            </div>
            <button onClick={createEvent} disabled={busy || !creating.title.trim() || !creating.date || !creating.time} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !creating.title.trim() || !creating.date || !creating.time ? 0.5 : 1 }}>{busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Criar', 'Create', 'Crear')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
