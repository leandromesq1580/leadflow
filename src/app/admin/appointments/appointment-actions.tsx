'use client'

import { useState } from 'react'

interface Buyer {
  id: string
  name: string
  remaining: number
  states: string[]
  availability: string[]
}

interface Props {
  leadId: string
  buyers: Buyer[]
}

const dayLabels: Record<string, string> = { weekday: 'Seg-Sex', saturday: 'Sab', sunday: 'Dom', holiday: 'Feriados' }
const periodLabels: Record<string, string> = { morning: 'Manha', afternoon: 'Tarde', evening: 'Noite' }

export function AppointmentActions({ leadId, buyers }: Props) {
  const [selectedBuyer, setSelectedBuyer] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = buyers.find(b => b.id === selectedBuyer)

  async function schedule() {
    if (!selectedBuyer || !dateTime) return
    setSaving(true)

    await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, buyer_id: selectedBuyer, scheduled_at: dateTime, notes }),
    })

    window.location.reload()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold mb-1" style={{ color: '#94a3b8' }}>Comprador</label>
          <select value={selectedBuyer} onChange={(e) => setSelectedBuyer(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
            <option value="">Selecionar...</option>
            {buyers.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.remaining} creditos) [{b.states.join(',')}]</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold mb-1" style={{ color: '#94a3b8' }}>Data/Hora</label>
          <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
        </div>
        <div>
          <label className="block text-[11px] font-bold mb-1" style={{ color: '#94a3b8' }}>Notas de qualificacao</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief..."
            className="w-full px-3 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>Disponibilidade:</span>
          {selected.availability.length > 0 ? selected.availability.map(a => {
            const [day, period] = a.split(':')
            return (
              <span key={a} className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#eef2ff', color: '#6366f1' }}>
                {dayLabels[day]} · {periodLabels[period]}
              </span>
            )
          }) : (
            <span className="text-[11px]" style={{ color: '#f59e0b' }}>Sem disponibilidade configurada</span>
          )}
        </div>
      )}

      <button onClick={schedule} disabled={!selectedBuyer || !dateTime || saving}
        className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-40"
        style={{ background: '#6366f1' }}>
        {saving ? 'Agendando...' : 'Agendar Appointment'}
      </button>
    </div>
  )
}
