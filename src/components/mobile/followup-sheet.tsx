'use client'

import { useState } from 'react'

export function FollowupSheet({
  leadId, buyerId, locale, onClose, onDone,
}: {
  leadId: string
  buyerId: string | null
  locale?: string
  onClose: () => void
  onDone: () => void
}) {
  const [type, setType] = useState('call')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  const types: { key: string; label: string }[] = [
    { key: 'note', label: L('Nota', 'Note', 'Nota') },
    { key: 'call', label: L('Ligação', 'Call', 'Llamada') },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'Email' },
    { key: 'meeting', label: L('Reunião', 'Meeting', 'Reunión') },
  ]

  async function save() {
    if (busy) return
    if (!buyerId) { setErr(L('Recarregue e tente de novo.', 'Reload and try again.', 'Recarga e intenta.')); return }
    if (type === 'meeting' && (!date || !time)) { setErr(L('Reunião precisa de data e hora.', 'Meeting needs date and time.', 'La reunión necesita fecha y hora.')); return }
    setBusy(true); setErr('')
    let scheduled_at: string | null = null
    if (date && time) scheduled_at = new Date(`${date}T${time}:00`).toISOString()
    else if (date) scheduled_at = new Date(`${date}T09:00:00`).toISOString()
    try {
      const r = await fetch(`/api/leads/${leadId}/follow-ups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, type, description: desc, scheduled_at }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || L('Não consegui agendar.', "Couldn't schedule.", 'No pude agendar.')); setBusy(false); return }
      onDone()
    } catch { setErr(L('Não consegui agendar.', "Couldn't schedule.", 'No pude agendar.')); setBusy(false); return }
    setBusy(false)
    onClose()
  }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
        <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
        <p style={{ margin: '2px 0 12px', fontSize: 15, fontWeight: 700 }}>{L('Agendar follow-up', 'Schedule follow-up', 'Agendar seguimiento')}</p>

        <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>{L('Tipo', 'Type', 'Tipo')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {types.map(tp => (
            <span key={tp.key} className={`m-chip m-tap${type === tp.key ? ' on' : ''}`} onClick={() => setType(tp.key)}>{tp.label}</span>
          ))}
        </div>

        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder={L('Observação (opcional)', 'Note (optional)', 'Nota (opcional)')} rows={2}
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', borderRadius: 13, padding: '11px 14px', fontSize: 14, outline: 'none', resize: 'none', marginBottom: 12, fontFamily: 'inherit' }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Data', 'Date', 'Fecha')}{type === 'meeting' ? ' *' : ''}</p>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="m-input" style={{ colorScheme: 'dark', height: 44 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Hora', 'Time', 'Hora')}{type === 'meeting' ? ' *' : ''}</p>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="m-input" style={{ colorScheme: 'dark', height: 44 }} />
          </div>
        </div>

        {err && <p style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>{err}</p>}

        <button onClick={save} disabled={busy} className="m-tap" style={{ width: '100%', marginTop: 16, background: 'var(--m-grad)', color: '#fff', border: 'none', borderRadius: 14, height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Agendar', 'Schedule', 'Agendar')}
        </button>
      </div>
    </div>
  )
}
