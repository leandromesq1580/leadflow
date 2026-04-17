'use client'

import { useEffect, useMemo, useState } from 'react'

interface CalendarEvent {
  id: string
  kind: 'appointment' | 'followup'
  title: string
  subtitle: string
  start: string
  status: string
  lead_id: string
  lead_name: string
  lead_phone: string
  color: string
  raw_id: string
}

type View = 'month' | 'week' | 'day'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function AppointmentsPage() {
  const [buyerId, setBuyerId] = useState('')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchBuyer(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchBuyer(authId: string) {
    const r = await fetch(`/api/settings?auth_user_id=${authId}`)
    const b = await r.json()
    setBuyerId(b.id)
  }

  const { rangeFrom, rangeTo } = useMemo(() => {
    if (view === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
      // Expand to full weeks
      const start = new Date(first)
      start.setDate(first.getDate() - first.getDay())
      const end = new Date(last)
      end.setDate(last.getDate() + (6 - last.getDay()))
      end.setHours(23, 59, 59)
      return { rangeFrom: start.toISOString(), rangeTo: end.toISOString() }
    }
    if (view === 'week') {
      const start = new Date(anchor)
      start.setDate(anchor.getDate() - anchor.getDay())
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(start.getDate() + 7)
      return { rangeFrom: start.toISOString(), rangeTo: end.toISOString() }
    }
    const start = new Date(anchor); start.setHours(0, 0, 0, 0)
    const end = new Date(anchor); end.setHours(23, 59, 59)
    return { rangeFrom: start.toISOString(), rangeTo: end.toISOString() }
  }, [view, anchor])

  useEffect(() => {
    if (!buyerId) return
    load()
  }, [buyerId, rangeFrom, rangeTo])

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/appointments/calendar?buyer_id=${buyerId}&from=${rangeFrom}&to=${rangeTo}`)
    if (r.ok) {
      const d = await r.json()
      setEvents(d.events || [])
    }
    setLoading(false)
  }

  function goPrev() {
    const d = new Date(anchor)
    if (view === 'month') d.setMonth(d.getMonth() - 1)
    else if (view === 'week') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    setAnchor(d)
  }
  function goNext() {
    const d = new Date(anchor)
    if (view === 'month') d.setMonth(d.getMonth() + 1)
    else if (view === 'week') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    setAnchor(d)
  }

  const headerTxt = view === 'month'
    ? `${MONTHS_PT[anchor.getMonth()]} ${anchor.getFullYear()}`
    : view === 'week'
      ? `Semana de ${new Date(rangeFrom).toLocaleDateString('pt-BR')}`
      : anchor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>📅 Appointments</h1>
          <p className="text-[13px]" style={{ color: '#64748b' }}>Agenda unificada de reuniões e follow-ups agendados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(new Date())}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
            style={{ background: '#eef2ff', color: '#6366f1' }}>
            Hoje
          </button>
          <div className="flex rounded-lg p-1" style={{ background: '#f1f5f9' }}>
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1 rounded-md text-[11px] font-bold transition-all capitalize"
                style={{ background: view === v ? '#fff' : 'transparent', color: view === v ? '#6366f1' : '#64748b' }}>
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={goPrev} className="w-8 h-8 rounded-lg text-[14px] font-bold" style={{ background: '#f8f9fc', color: '#64748b' }}>‹</button>
        <p className="text-[15px] font-bold capitalize" style={{ color: '#1a1a2e' }}>{headerTxt}</p>
        <button onClick={goNext} className="w-8 h-8 rounded-lg text-[14px] font-bold" style={{ background: '#f8f9fc', color: '#64748b' }}>›</button>
      </div>

      {loading && <div className="text-center py-10 text-[12px]" style={{ color: '#94a3b8' }}>Carregando...</div>}

      {!loading && view === 'month' && <MonthView anchor={anchor} events={events} onClick={setSelectedEvent} />}
      {!loading && view === 'week' && <WeekView anchor={anchor} events={events} onClick={setSelectedEvent} />}
      {!loading && view === 'day' && <DayView anchor={anchor} events={events} onClick={setSelectedEvent} />}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-5 text-[11px]" style={{ color: '#64748b' }}>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#6366f1' }} /> Appointment agendado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#8b5cf6' }} /> Reunião (follow-up)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} /> Ligação (follow-up)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#06b6d4' }} /> Nota</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#10b981' }} /> Concluído</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#ef4444' }} /> No-show</span>
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onChanged={() => { setSelectedEvent(null); load() }}
        />
      )}
    </div>
  )
}

function MonthView({ anchor, events, onClick }: { anchor: Date; events: CalendarEvent[]; onClick: (e: CalendarEvent) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(first); start.setDate(first.getDate() - first.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    days.push(d)
  }
  const today = new Date()

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map(w => (
          <div key={w} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider"
            style={{ background: '#f8f9fc', color: '#94a3b8' }}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = d.toDateString() === today.toDateString()
          const dayEvents = events.filter(e => new Date(e.start).toDateString() === d.toDateString())
          return (
            <div key={i} className="min-h-[100px] p-1.5"
              style={{
                background: inMonth ? '#fff' : '#fafbfc',
                borderRight: i % 7 < 6 ? '1px solid #f1f5f9' : 'none',
                borderBottom: i < 35 ? '1px solid #f1f5f9' : 'none',
              }}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[11px] font-bold ${isToday ? 'text-white px-1.5 py-0.5 rounded-full' : ''}`}
                  style={{ background: isToday ? '#6366f1' : 'transparent', color: isToday ? '#fff' : inMonth ? '#1a1a2e' : '#c0c8d4' }}>
                  {d.getDate()}
                </span>
                {dayEvents.length > 3 && (
                  <span className="text-[9px]" style={{ color: '#94a3b8' }}>+{dayEvents.length - 3}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => (
                  <button key={e.id} onClick={() => onClick(e)}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate hover:opacity-80"
                    style={{ background: e.color + '22', color: e.color, borderLeft: `3px solid ${e.color}` }}
                    title={e.title}>
                    {new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {e.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ anchor, events, onClick }: { anchor: Date; events: CalendarEvent[]; onClick: (e: CalendarEvent) => void }) {
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay()); start.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d
  })
  const hours = Array.from({ length: 14 }, (_, i) => i + 7) // 07-20h
  const today = new Date()

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
        <div className="p-2" style={{ background: '#f8f9fc' }} />
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          return (
            <div key={i} className="p-2 text-center"
              style={{ background: isToday ? '#eef2ff' : '#f8f9fc', borderLeft: '1px solid #f1f5f9' }}>
              <p className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>{WEEKDAYS[i]}</p>
              <p className="text-[18px] font-extrabold" style={{ color: isToday ? '#6366f1' : '#1a1a2e' }}>{d.getDate()}</p>
            </div>
          )
        })}
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map(h => (
          <div key={h} className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)', borderTop: '1px solid #f1f5f9' }}>
            <div className="px-2 py-3 text-[10px]" style={{ color: '#94a3b8' }}>
              {String(h).padStart(2, '0')}:00
            </div>
            {days.map((d, di) => {
              const cell = new Date(d); cell.setHours(h)
              const cellEnd = new Date(d); cellEnd.setHours(h + 1)
              const cellEvents = events.filter(e => {
                const t = new Date(e.start)
                return t >= cell && t < cellEnd
              })
              return (
                <div key={di} className="p-0.5 min-h-[50px] relative"
                  style={{ borderLeft: '1px solid #f1f5f9' }}>
                  {cellEvents.map(e => (
                    <button key={e.id} onClick={() => onClick(e)}
                      className="block w-full text-left px-2 py-1 rounded text-[10px] font-bold mb-0.5 hover:opacity-80 truncate"
                      style={{ background: e.color + '22', color: e.color, borderLeft: `3px solid ${e.color}` }}>
                      {new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {e.title}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function DayView({ anchor, events, onClick }: { anchor: Date; events: CalendarEvent[]; onClick: (e: CalendarEvent) => void }) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6) // 06-22
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="overflow-y-auto max-h-[700px]">
        {hours.map(h => {
          const cell = new Date(anchor); cell.setHours(h, 0, 0, 0)
          const cellEnd = new Date(anchor); cellEnd.setHours(h + 1, 0, 0, 0)
          const cellEvents = events.filter(e => {
            const t = new Date(e.start)
            return t >= cell && t < cellEnd
          })
          return (
            <div key={h} className="grid" style={{ gridTemplateColumns: '80px 1fr', borderTop: '1px solid #f1f5f9', minHeight: 70 }}>
              <div className="px-3 py-3 text-[11px]" style={{ color: '#94a3b8' }}>
                {String(h).padStart(2, '0')}:00
              </div>
              <div className="p-2 space-y-1" style={{ borderLeft: '1px solid #f1f5f9' }}>
                {cellEvents.map(e => (
                  <button key={e.id} onClick={() => onClick(e)}
                    className="block w-full text-left px-3 py-2 rounded-lg hover:opacity-90"
                    style={{ background: e.color + '22', color: e.color, borderLeft: `4px solid ${e.color}` }}>
                    <p className="text-[13px] font-bold">
                      {new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {e.title}
                    </p>
                    {e.subtitle && <p className="text-[11px] mt-0.5 opacity-80">{e.subtitle}</p>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventDetail({ event, onClose, onChanged }: { event: CalendarEvent; onClose: () => void; onChanged: () => void }) {
  const startDate = new Date(event.start)
  const [editing, setEditing] = useState(false)
  const [newDate, setNewDate] = useState(startDate.toISOString().slice(0, 10))
  const [newTime, setNewTime] = useState(startDate.toTimeString().slice(0, 5))
  const [busy, setBusy] = useState(false)

  async function reschedule() {
    if (!newDate || !newTime) { alert('Data e hora obrigatórias'); return }
    setBusy(true)
    const iso = new Date(`${newDate}T${newTime}:00`).toISOString()
    const endpoint = event.kind === 'appointment'
      ? `/api/appointments/${event.raw_id}`
      : `/api/follow-ups/${event.raw_id}`
    const r = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: iso }),
    })
    setBusy(false)
    if (r.ok) onChanged()
    else alert('Erro ao reagendar')
  }

  async function del() {
    if (!confirm('Deletar este evento? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    const endpoint = event.kind === 'appointment'
      ? `/api/appointments/${event.raw_id}`
      : `/api/follow-ups/${event.raw_id}`
    const r = await fetch(endpoint, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) onChanged()
    else alert('Erro ao deletar')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
              style={{ background: event.color + '22', color: event.color }}>
              {event.kind === 'appointment' ? 'APPOINTMENT' : event.subtitle.toUpperCase()}
            </span>
            <h2 className="text-[18px] font-extrabold mt-2" style={{ color: '#1a1a2e' }}>{event.lead_name}</h2>
            <p className="text-[13px]" style={{ color: '#64748b' }}>{event.lead_phone}</p>
          </div>
          <button onClick={onClose} className="text-[20px]" style={{ color: '#94a3b8' }}>×</button>
        </div>

        <div className="rounded-xl p-4 mb-4" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Quando</p>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-[11px] font-bold" style={{ color: '#6366f1' }}>
                ✎ Reagendar
              </button>
            )}
          </div>
          {!editing ? (
            <p className="text-[14px] font-bold mt-1" style={{ color: '#1a1a2e' }}>
              {startDate.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <div className="flex gap-2 mt-2">
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-[12px]"
                style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className="w-[120px] px-3 py-2 rounded-lg text-[12px]"
                style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
              <button onClick={reschedule} disabled={busy}
                className="px-3 py-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                style={{ background: '#6366f1' }}>
                Salvar
              </button>
              <button onClick={() => setEditing(false)} className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>
                ×
              </button>
            </div>
          )}
        </div>

        {event.title && (
          <div className="rounded-xl p-4 mb-4" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Descrição</p>
            <p className="text-[13px]" style={{ color: '#1a1a2e' }}>{event.title}</p>
          </div>
        )}

        <a href={`/dashboard/pipeline?lead=${event.lead_id}`}
          className="block w-full text-center py-3 rounded-xl text-[13px] font-bold text-white mb-2"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          Abrir lead no Pipeline →
        </a>
        <button onClick={del} disabled={busy}
          className="block w-full text-center py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-50"
          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          🗑 Deletar evento
        </button>
      </div>
    </div>
  )
}
