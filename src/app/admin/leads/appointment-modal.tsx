'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Client { id: string; name: string; remaining: number }
interface Props {
  leadId: string
  leadName: string
  clients: Client[]   // só clientes que COMPRARAM appointments e têm saldo
}

/** Nome do lead clicável → modal pra ENTREGAR um appointment pra um cliente que comprou (abate crédito). */
export function AppointmentModal({ leadId, leadName, clients }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  function reset() { setDate(''); setTime('09:00'); setNotes(''); setBuyerId(''); setErr(''); setDone(false) }

  async function gerar() {
    setErr('')
    if (!date || !time) { setErr('Escolha a data e a hora.'); return }
    if (!buyerId) { setErr('Escolha o cliente que vai receber.'); return }
    setSaving(true)
    try {
      const scheduled_at = new Date(`${date}T${time}:00`).toISOString()
      const r = await fetch('/api/admin/create-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, buyer_id: buyerId, scheduled_at, notes }),
      })
      if (r.ok) {
        setDone(true)
        setTimeout(() => { setOpen(false); reset(); router.refresh() }, 1300)
      } else {
        const d = await r.json().catch(() => ({}))
        setErr(d.error || 'Falha ao gerar o appointment.')
      }
    } catch { setErr('Erro de rede.') }
    setSaving(false)
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-lg text-[14px] border focus:outline-none focus:ring-2 focus:ring-indigo-200'
  const inputStyle = { borderColor: '#e8ecf4', color: '#1a1a2e', background: '#fff' }
  const clientName = clients.find(c => c.id === buyerId)?.name

  return (
    <>
      <button onClick={() => setOpen(true)} title="Gerar appointment pra um cliente"
        className="text-[13px] font-semibold text-left hover:underline flex items-center gap-1" style={{ color: '#1a1a2e' }}>
        {leadName}
        <span className="text-[11px]" style={{ color: '#a5b4fc' }}>🤝</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-[460px] rounded-2xl p-6" style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-8">
                <div className="text-[40px] mb-2">✅</div>
                <p className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Appointment entregue!</p>
                <p className="text-[13px] mt-1" style={{ color: '#64748b' }}>Pra {clientName} · 1 crédito de appointment abatido</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-[36px] mb-2">🔒</div>
                <p className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Nenhum cliente com appointments</p>
                <p className="text-[13px] mt-1 mb-4" style={{ color: '#64748b' }}>
                  Appointment só pode ser entregue a quem <strong>comprou o pacote de appointments</strong> e tem saldo.
                </p>
                <button onClick={() => setOpen(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>Entendi</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[16px] font-extrabold" style={{ color: '#1a1a2e' }}>🤝 Gerar Appointment</h3>
                  <button onClick={() => setOpen(false)} className="text-[20px] leading-none" style={{ color: '#94a3b8' }}>×</button>
                </div>
                <p className="text-[12px] mb-4" style={{ color: '#64748b' }}>Entregar <strong>{leadName}</strong> como appointment pra um cliente</p>

                <label className="block text-[12px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Data e hora *</label>
                <div className="flex gap-2 mb-4">
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} style={{ ...inputStyle, flex: 1 }} />
                  <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 120 }} />
                </div>

                <label className="block text-[12px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Observação (qualificação)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="O que o cliente precisa saber sobre esse lead…"
                  className={inputCls + ' mb-4 resize-none'} style={inputStyle} />

                <label className="block text-[12px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Cliente (comprou appointments) *</label>
                <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className={inputCls + ' mb-1 cursor-pointer'} style={inputStyle}>
                  <option value="">— escolha o cliente —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} — faltam {c.remaining}</option>)}
                </select>
                <p className="text-[11px] mb-4" style={{ color: '#94a3b8' }}>Só aparecem clientes que compraram o pacote de appointments e têm saldo. Gerar abate 1 crédito.</p>

                {err && <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{err}</p>}

                <div className="flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} disabled={saving} className="px-4 py-2.5 text-[13px] font-semibold" style={{ color: '#94a3b8' }}>Cancelar</button>
                  <button onClick={gerar} disabled={saving}
                    className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    {saving ? 'Entregando…' : 'Gerar Appointment'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
