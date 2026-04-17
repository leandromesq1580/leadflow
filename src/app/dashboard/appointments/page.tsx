'use client'

import { useEffect, useMemo, useState } from 'react'

type EventKind = 'appointment' | 'followup' | 'event' | 'task'

interface CalendarEvent {
  id: string
  kind: EventKind
  title: string
  subtitle: string
  start: string
  end: string | null
  status: string
  lead_id: string | null
  lead_name: string | null
  lead_phone: string | null
  color: string
  raw_id: string
  completed: boolean
  all_day?: boolean
  location?: string | null
  description?: string | null
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
  const [creating, setCreating] = useState<'event' | 'task' | null>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)

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
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>📅 Agenda</h1>
          <p className="text-[13px]" style={{ color: '#64748b' }}>Eventos, tarefas, reuniões e appointments unificados</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Create menu */}
          <div className="relative">
            <button onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="px-4 py-2 rounded-lg text-[12px] font-bold text-white flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' }}>
              + Criar ▾
            </button>
            {showCreateMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl p-1 min-w-[180px]"
                  style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                  <button onClick={() => { setCreating('event'); setShowCreateMenu(false) }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-emerald-50 flex items-center gap-2"
                    style={{ color: '#1a1a2e' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
                    📆 Evento
                  </button>
                  <button onClick={() => { setCreating('task'); setShowCreateMenu(false) }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-sky-50 flex items-center gap-2"
                    style={{ color: '#1a1a2e' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: '#0ea5e9' }} />
                    ☐ Tarefa
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setAnchor(new Date())}
            className="px-3 py-2 rounded-lg text-[12px] font-bold"
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
        <LegendItem color="#6366f1" kind="appointment" label="Appointment" />
        <LegendItem color="#10b981" kind="event" label="Evento" />
        <LegendItem color="#0ea5e9" kind="task" label="Tarefa" />
        <LegendItem color="#8b5cf6" kind="followup" label="Reunião (follow-up)" />
        <LegendItem color="#f59e0b" kind="followup" label="Ligação (follow-up)" />
      </div>

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onChanged={() => { setSelectedEvent(null); load() }}
        />
      )}

      {creating && (
        <CreateItemModal
          kind={creating}
          buyerId={buyerId}
          anchor={anchor}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); load() }}
        />
      )}
    </div>
  )
}

function LegendItem({ color, kind, label }: { color: string; kind: EventKind; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3" style={{
        background: color,
        borderRadius: kind === 'task' ? '2px' : kind === 'event' ? '3px' : '50%',
        border: kind === 'appointment' ? `2px solid ${color}` : 'none',
      }} />
      {label}
    </span>
  )
}

// Unified event pill with visual distinction by kind
function EventPill({ event, onClick, compact }: { event: CalendarEvent; onClick: () => void; compact?: boolean }) {
  const time = new Date(event.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const kind = event.kind

  // Task: checkbox style
  if (kind === 'task') {
    return (
      <button onClick={onClick}
        className={`w-full text-left ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} rounded text-[10px] font-semibold hover:opacity-80 flex items-center gap-1 truncate`}
        style={{
          background: event.completed ? '#f1f5f9' : '#e0f2fe',
          color: event.completed ? '#94a3b8' : '#0369a1',
          border: `1px dashed ${event.completed ? '#cbd5e1' : '#38bdf8'}`,
          textDecoration: event.completed ? 'line-through' : 'none',
        }}
        title={event.title}>
        <span>{event.completed ? '☑' : '☐'}</span>
        <span className="truncate">{time} {event.title}</span>
      </button>
    )
  }

  // Event: solid block with rounded corners
  if (kind === 'event') {
    return (
      <button onClick={onClick}
        className={`w-full text-left ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} rounded-md text-[10px] font-bold hover:opacity-80 truncate`}
        style={{
          background: event.color,
          color: '#fff',
          boxShadow: '0 1px 2px rgba(16,185,129,0.2)',
        }}
        title={event.title}>
        📆 {time} {event.title}
      </button>
    )
  }

  // Appointment: border-left thick + bg tint
  if (kind === 'appointment') {
    return (
      <button onClick={onClick}
        className={`w-full text-left ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} rounded text-[10px] font-bold hover:opacity-80 truncate`}
        style={{
          background: event.color + '15',
          color: event.color,
          borderLeft: `4px solid ${event.color}`,
        }}
        title={event.title}>
        ⭐ {time} {event.title}
      </button>
    )
  }

  // Follow-up: pill shape
  return (
    <button onClick={onClick}
      className={`w-full text-left ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'} rounded-full text-[10px] font-semibold hover:opacity-80 truncate`}
      style={{
        background: event.color + '22',
        color: event.color,
        border: `1px solid ${event.color}44`,
      }}
      title={event.title}>
      • {time} {event.title}
    </button>
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
            <div key={i} className="min-h-[110px] p-1.5"
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
                  <EventPill key={e.id} event={e} onClick={() => onClick(e)} compact />
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
  const hours = Array.from({ length: 14 }, (_, i) => i + 7)
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
                <div key={di} className="p-0.5 min-h-[50px] relative space-y-0.5"
                  style={{ borderLeft: '1px solid #f1f5f9' }}>
                  {cellEvents.map(e => (
                    <EventPill key={e.id} event={e} onClick={() => onClick(e)} compact />
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
  const hours = Array.from({ length: 17 }, (_, i) => i + 6)
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
                  <EventPill key={e.id} event={e} onClick={() => onClick(e)} />
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

  const endpointBase = event.kind === 'appointment' ? `/api/appointments/${event.raw_id}`
    : event.kind === 'followup' ? `/api/follow-ups/${event.raw_id}`
    : `/api/calendar-items/${event.raw_id}`
  const dateField = event.kind === 'appointment' ? 'scheduled_at'
    : event.kind === 'followup' ? 'scheduled_at'
    : 'start_at'

  async function reschedule() {
    if (!newDate || !newTime) { alert('Data e hora obrigatórias'); return }
    setBusy(true)
    const iso = new Date(`${newDate}T${newTime}:00`).toISOString()
    const r = await fetch(endpointBase, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [dateField]: iso }),
    })
    setBusy(false)
    if (r.ok) onChanged()
    else alert('Erro ao reagendar')
  }

  async function toggleComplete() {
    setBusy(true)
    const newState = !event.completed
    if (event.kind === 'task' || event.kind === 'event') {
      await fetch(endpointBase, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newState }),
      })
    } else if (event.kind === 'followup') {
      await fetch(endpointBase, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newState }),
      })
    } else if (event.kind === 'appointment') {
      await fetch(endpointBase, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newState ? 'completed' : 'scheduled' }),
      })
    }
    setBusy(false)
    onChanged()
  }

  async function del() {
    if (!confirm('Deletar este item? Ação não pode ser desfeita.')) return
    setBusy(true)
    const r = await fetch(endpointBase, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) onChanged()
    else alert('Erro ao deletar')
  }

  const kindLabel: Record<EventKind, string> = {
    appointment: 'APPOINTMENT',
    followup: (event.subtitle || 'FOLLOW-UP').toUpperCase(),
    event: 'EVENTO',
    task: 'TAREFA',
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
              style={{ background: event.color + '22', color: event.color }}>
              {kindLabel[event.kind]}
            </span>
            <h2 className="text-[18px] font-extrabold mt-2" style={{ color: '#1a1a2e', textDecoration: event.completed ? 'line-through' : 'none' }}>
              {event.lead_name || event.title}
            </h2>
            {event.lead_phone && <p className="text-[13px]" style={{ color: '#64748b' }}>{event.lead_phone}</p>}
          </div>
          <button onClick={onClose} className="text-[20px]" style={{ color: '#94a3b8' }}>×</button>
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
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
              {event.end && (
                <span className="text-[12px] font-medium ml-1" style={{ color: '#64748b' }}>
                  até {new Date(event.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          ) : (
            <div className="flex gap-2 mt-2">
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-[12px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className="w-[120px] px-3 py-2 rounded-lg text-[12px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
              <button onClick={reschedule} disabled={busy}
                className="px-3 py-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50" style={{ background: '#6366f1' }}>
                Salvar
              </button>
              <button onClick={() => setEditing(false)} className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>×</button>
            </div>
          )}
        </div>

        {(event.description || event.title) && (
          <div className="rounded-xl p-4 mb-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Descrição</p>
            <p className="text-[13px] whitespace-pre-wrap" style={{ color: '#1a1a2e' }}>
              {event.description || event.title}
            </p>
          </div>
        )}

        {event.location && (
          <div className="rounded-xl p-4 mb-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>📍 Local</p>
            <p className="text-[13px]" style={{ color: '#1a1a2e' }}>{event.location}</p>
          </div>
        )}

        <div className="space-y-2">
          <button onClick={toggleComplete} disabled={busy}
            className="block w-full text-center py-2.5 rounded-xl text-[12px] font-bold"
            style={{
              background: event.completed ? '#f1f5f9' : '#ecfdf5',
              color: event.completed ? '#64748b' : '#065f46',
              border: `1px solid ${event.completed ? '#cbd5e1' : '#a7f3d0'}`,
            }}>
            {event.completed ? '↺ Marcar pendente' : '✓ Marcar concluído'}
          </button>

          {event.lead_id && (
            <a href={`/dashboard/pipeline?lead=${event.lead_id}`}
              className="block w-full text-center py-3 rounded-xl text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              Abrir lead no Pipeline →
            </a>
          )}

          <button onClick={del} disabled={busy}
            className="block w-full text-center py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-50"
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            🗑 Deletar
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateItemModal({ kind, buyerId, anchor, onClose, onCreated }: {
  kind: 'event' | 'task'
  buyerId: string
  anchor: Date
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(anchor.toISOString().slice(0, 10))
  const [time, setTime] = useState(kind === 'event' ? '09:00' : '09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEvent = kind === 'event'
  const color = isEvent ? '#10b981' : '#0ea5e9'
  const icon = isEvent ? '📆' : '☐'
  const label = isEvent ? 'Evento' : 'Tarefa'

  async function save() {
    setError('')
    if (!title.trim()) { setError('Título obrigatório'); return }
    if (!date) { setError('Data obrigatória'); return }
    if (!allDay && !time) { setError('Hora obrigatória'); return }

    setSaving(true)
    const start_at = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${time}:00`).toISOString()
    const end_at = (isEvent && !allDay && endTime)
      ? new Date(`${date}T${endTime}:00`).toISOString()
      : null

    const r = await fetch('/api/calendar-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        title: title.trim(),
        description: description.trim() || null,
        start_at,
        end_at,
        all_day: allDay,
        location: location.trim() || null,
        color,
      }),
    })
    setSaving(false)
    if (r.ok) onCreated()
    else {
      const d = await r.json()
      setError(d.error || 'Erro ao salvar')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto p-6" onClick={onClose}>
      <div className="mx-auto max-w-[520px] rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[22px]">{icon}</span>
          <h2 className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>Novo {label}</h2>
        </div>

        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder={isEvent ? 'Título do evento' : 'O que precisa ser feito?'}
            autoFocus
            className="w-full px-3 py-3 rounded-xl text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />

          {isEvent && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
              <span className="text-[12px]" style={{ color: '#64748b' }}>Dia inteiro</span>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
            {!allDay && (
              <div>
                <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>
                  {isEvent ? 'Início' : 'Hora'}
                </label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
              </div>
            )}
          </div>

          {isEvent && !allDay && (
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Fim (opcional)</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
          )}

          {isEvent && (
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>📍 Local (opcional)</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Endereço ou link da reunião"
                className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Descrição (opcional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg text-[13px] resize-none" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          </div>
        </div>

        {error && <p className="text-[12px] mt-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️ {error}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !title.trim()}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: color }}>
            {saving ? 'Salvando...' : `Criar ${label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
