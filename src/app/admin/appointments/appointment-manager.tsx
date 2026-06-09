'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Appt {
  id: string
  scheduled_at: string
  status: string
  qualification_notes: string | null
  lead_name: string
  lead_phone: string
  buyer_id: string
  buyer_name: string
}
interface Client { id: string; name: string; remaining: number }
interface Props { appointments: Appt[]; clients: Client[] }

const STATUSES = [
  { v: 'scheduled', label: '📅 Agendado', color: '#6366f1', bg: '#eef2ff' },
  { v: 'confirmed', label: '✅ Confirmado', color: '#0891b2', bg: '#ecfeff' },
  { v: 'completed', label: '🏆 Concluído', color: '#15803d', bg: '#dcfce7' },
  { v: 'no_show', label: '🚫 Não compareceu', color: '#b45309', bg: '#fffbeb' },
  { v: 'cancelled', label: '❌ Cancelado', color: '#dc2626', bg: '#fef2f2' },
]
const stMeta = (s: string) => STATUSES.find(x => x.v === s) || STATUSES[0]

function toLocalParts(iso: string) {
  const d = new Date(iso)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export function AppointmentManager({ appointments, clients }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [status, setStatus] = useState('scheduled')
  const [notes, setNotes] = useState('')
  const [buyerId, setBuyerId] = useState('')

  function openEdit(a: Appt) {
    const { date, time } = toLocalParts(a.scheduled_at)
    setDate(date); setTime(time); setStatus(a.status); setNotes(a.qualification_notes || ''); setBuyerId(a.buyer_id)
    setEditing(a.id)
  }

  async function save(id: string) {
    setBusy(true)
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString()
    const r = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at, status, qualification_notes: notes, buyer_id: buyerId }),
    })
    setBusy(false); setEditing(null)
    if (r.ok) router.refresh()
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'Falha ao salvar') }
  }

  async function remove(id: string) {
    if (!confirm('Excluir este appointment? (não devolve o crédito automaticamente)')) return
    setBusy(true)
    const r = await fetch(`/api/appointments/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) router.refresh()
    else alert('Falha ao excluir')
  }

  if (appointments.length === 0) {
    return <p className="text-[13px] px-6 py-6" style={{ color: '#94a3b8' }}>Nenhum appointment ainda. Gere pelo nome do lead em "Todos os Leads".</p>
  }

  const inputCls = 'px-3 py-2 rounded-lg text-[13px] border'
  const inputStyle = { borderColor: '#e8ecf4', color: '#1a1a2e', background: '#fff' }

  return (
    <div>
      {appointments.map((a, i) => {
        const m = stMeta(a.status)
        const dt = new Date(a.scheduled_at)
        const when = dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        const isEd = editing === a.id
        return (
          <div key={a.id} style={{ borderBottom: i < appointments.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <div className="flex items-center gap-3 px-6 py-3">
              <span className="text-[12px] font-bold px-2 py-1 rounded-lg text-center" style={{ background: '#f1f5f9', color: '#475569', minWidth: 96 }}>{when}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a2e' }}>{a.lead_name}</p>
                <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{a.lead_phone} · → {a.buyer_name}</p>
                {a.qualification_notes && !isEd && <p className="text-[11px] truncate" style={{ color: '#64748b' }}>📝 {a.qualification_notes}</p>}
              </div>
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: m.bg, color: m.color }}>{m.label}</span>
              <button onClick={() => isEd ? setEditing(null) : openEdit(a)} className="text-[12px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#eef2ff', color: '#6366f1' }}>
                {isEd ? 'Fechar' : 'Editar'}
              </button>
            </div>

            {isEd && (
              <div className="px-6 pb-4 pt-1" style={{ background: '#f8f9fc' }}>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Cliente — pra quem foi agendado (trocar = transfere o crédito)</label>
                <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className={inputCls + ' cursor-pointer mb-2 w-full'} style={inputStyle}>
                  {clients.map(c => <option key={c.id} value={c.id}>👤 {c.name} — saldo {c.remaining}</option>)}
                </select>
                <div className="flex flex-wrap gap-2 mb-2 items-center">
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} style={inputStyle} />
                  <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} style={inputStyle} />
                  <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls + ' cursor-pointer'} style={inputStyle}>
                    {STATUSES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observação / qualificação…"
                  className={inputCls + ' w-full resize-none mb-2'} style={inputStyle} />
                <div className="flex justify-between items-center">
                  <button onClick={() => remove(a.id)} disabled={busy} className="text-[12px] font-semibold" style={{ color: '#dc2626' }}>Excluir</button>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} disabled={busy} className="px-3 py-1.5 text-[12px] font-semibold" style={{ color: '#94a3b8' }}>Cancelar</button>
                    <button onClick={() => save(a.id)} disabled={busy} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#6366f1' }}>
                      {busy ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
