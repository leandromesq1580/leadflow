'use client'

import { useState } from 'react'
import { MIcon } from './icons'

export type EventKind = 'appointment' | 'followup' | 'event' | 'task'

export interface AgendaEvent {
  id: string
  raw_id: string
  kind: EventKind
  title: string
  subtitle?: string
  start: string
  status?: string
  lead_id?: string | null
  lead_name?: string | null
  lead_phone?: string | null
  color?: string
  completed?: boolean
  description?: string | null
  location?: string | null
}

/**
 * Detalhe do item da agenda no app, com as acoes que so existiam no dashboard:
 * concluir/reabrir, reagendar, nao-compareceu e deletar.
 *
 * Cada tipo mora numa tabela diferente, entao o endpoint e o campo de data mudam
 * conforme o kind (mesmo mapeamento do EventDetail do dashboard).
 * ATENCAO: usa raw_id — o `id` vem prefixado da API (ex.: "appt-<uuid>").
 */
export function EventSheet({ event, locale, onClose, onChanged }: {
  event: AgendaEvent
  locale?: string
  onClose: () => void
  onChanged: () => void
}) {
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)
  const startDate = new Date(event.start)

  const [editing, setEditing] = useState(false)
  const [newDate, setNewDate] = useState(() => {
    const d = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000)
    return d.toISOString().slice(0, 10)
  })
  const [newTime, setNewTime] = useState(startDate.toTimeString().slice(0, 5))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const endpoint = event.kind === 'appointment' ? `/api/appointments/${event.raw_id}`
    : event.kind === 'followup' ? `/api/follow-ups/${event.raw_id}`
    : `/api/calendar-items/${event.raw_id}`
  const dateField = event.kind === 'event' || event.kind === 'task' ? 'start_at' : 'scheduled_at'

  async function patch(body: Record<string, unknown>, failMsg: string) {
    if (busy) return false
    setBusy(true); setErr(null)
    try {
      const r = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { setErr(failMsg); setBusy(false); return false }
      setBusy(false)
      return true
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')); setBusy(false); return false }
  }

  async function reschedule() {
    if (!newDate || !newTime) return
    const iso = new Date(`${newDate}T${newTime}:00`).toISOString()
    if (await patch({ [dateField]: iso }, L('Não consegui reagendar.', "Couldn't reschedule.", 'Error.'))) { onChanged(); onClose() }
  }

  async function toggleComplete() {
    const next = !event.completed
    const body = event.kind === 'appointment'
      ? { status: next ? 'completed' : 'scheduled' }
      : { completed: next }
    if (await patch(body, L('Não consegui atualizar.', "Couldn't update.", 'Error.'))) { onChanged(); onClose() }
  }

  async function toggleNoShow() {
    const isNoShow = event.status === 'no_show'
    const nextStatus = isNoShow ? (event.kind === 'appointment' ? 'scheduled' : 'pending') : 'no_show'
    if (await patch({ status: nextStatus }, L('Não consegui atualizar.', "Couldn't update.", 'Error.'))) { onChanged(); onClose() }
  }

  async function del() {
    if (busy) return
    if (!confirm(L('Deletar este item? Não dá pra desfazer.', 'Delete this item? This cannot be undone.', '¿Eliminar? No se puede deshacer.'))) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(endpoint, { method: 'DELETE' })
      if (!r.ok) { setErr(L('Não consegui deletar.', "Couldn't delete.", 'Error.')); setBusy(false); return }
      onChanged(); onClose()
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error.')); setBusy(false) }
  }

  const kindLabel: Record<EventKind, string> = {
    appointment: 'APPOINTMENT',
    followup: (event.subtitle || L('FOLLOW-UP', 'FOLLOW-UP', 'FOLLOW-UP')).toUpperCase(),
    event: L('EVENTO', 'EVENT', 'EVENTO'),
    task: L('TAREFA', 'TASK', 'TAREA'),
  }

  const dtLabel = startDate.toLocaleString(locale === 'en' ? 'en-US' : locale === 'es' ? 'es' : 'pt-BR',
    { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const btn = (bg: string, color: string, border?: string): React.CSSProperties => ({
    width: '100%', height: 44, borderRadius: 12, background: bg, color,
    border: border ? `1px solid ${border}` : 'none', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', marginBottom: 8, opacity: busy ? 0.6 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  })

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', paddingBottom: 'calc(var(--m-nav-h) + env(safe-area-inset-bottom) + 20px)' }}>
        <div className="m-sheet-grab" />

        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ width: 4, alignSelf: 'stretch', minHeight: 34, borderRadius: 4, background: event.color || '#6366f1', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="m-faint" style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4 }}>{kindLabel[event.kind]}</p>
              <p style={{ margin: '3px 0 0', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{event.title}</p>
              <p className="m-muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>{dtLabel}</p>
            </div>
            <button onClick={onClose} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', display: 'flex', cursor: 'pointer', padding: 4 }}>
              <MIcon name="x" size={20} />
            </button>
          </div>

          {event.status === 'no_show' && (
            <p style={{ margin: '10px 0 0', fontSize: 11.5, fontWeight: 700, color: '#f87171' }}>
              {L('Marcado como "Não compareceu"', 'Marked as "No show"', 'Marcado como "No asistió"')}
            </p>
          )}
          {event.description && (
            <p className="m-muted" style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>{event.description}</p>
          )}
          {event.location && (
            <p className="m-muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>📍 {event.location}</p>
          )}
        </div>

        <div style={{ padding: '0 20px' }}>
          {editing ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="m-input" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ flex: 1 }} />
                <input className="m-input" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ width: 118 }} />
              </div>
              <button onClick={reschedule} disabled={busy} className="m-tap" style={btn('var(--m-grad)', '#fff')}>
                {busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Confirmar novo horário', 'Confirm new time', 'Confirmar')}
              </button>
              <button onClick={() => setEditing(false)} disabled={busy} className="m-tap" style={btn('transparent', 'var(--m-faint)')}>
                {L('Cancelar', 'Cancel', 'Cancelar')}
              </button>
            </div>
          ) : (
            <>
              <button onClick={toggleComplete} disabled={busy} className="m-tap"
                style={btn(event.completed ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.16)', event.completed ? 'var(--m-muted)' : '#34d399', event.completed ? 'var(--m-border)' : 'rgba(16,185,129,0.35)')}>
                <MIcon name="check" size={16} />
                {event.completed ? L('Marcar pendente', 'Mark pending', 'Marcar pendiente') : L('Marcar concluído', 'Mark done', 'Marcar hecho')}
              </button>

              <button onClick={() => setEditing(true)} disabled={busy} className="m-tap"
                style={btn('rgba(255,255,255,0.06)', 'var(--m-text)', 'var(--m-border)')}>
                <MIcon name="calendar" size={16} />
                {L('Reagendar', 'Reschedule', 'Reprogramar')}
              </button>

              {(event.kind === 'appointment' || event.kind === 'followup') && (
                <button onClick={toggleNoShow} disabled={busy} className="m-tap"
                  style={btn('rgba(239,68,68,0.12)', '#f87171', 'rgba(239,68,68,0.3)')}>
                  {event.status === 'no_show'
                    ? L('Desfazer "Não compareceu"', 'Undo "No show"', 'Deshacer "No asistió"')
                    : L('Não compareceu', 'No show', 'No asistió')}
                </button>
              )}

              {event.lead_phone && (
                <a href={`tel:${event.lead_phone}`} className="m-tap" style={{ ...btn('rgba(255,255,255,0.06)', 'var(--m-text)', 'var(--m-border)'), textDecoration: 'none' }}>
                  <MIcon name="phone" size={16} />
                  {L('Ligar', 'Call', 'Llamar')}{event.lead_name ? ` · ${event.lead_name}` : ''}
                </a>
              )}

              {event.lead_id && (
                <a href={`/m/leads/${event.lead_id}`} className="m-tap" style={{ ...btn('var(--m-grad)', '#fff'), textDecoration: 'none' }}>
                  {L('Abrir lead', 'Open lead', 'Abrir lead')} →
                </a>
              )}

              <button onClick={del} disabled={busy} className="m-tap"
                style={btn('transparent', '#f87171', 'rgba(239,68,68,0.25)')}>
                <MIcon name="x" size={15} />
                {L('Deletar', 'Delete', 'Eliminar')}
              </button>
            </>
          )}

          {err && <p style={{ fontSize: 12.5, color: '#f87171', margin: '2px 0 8px', textAlign: 'center' }}>{err}</p>}
        </div>
      </div>
    </div>
  )
}
