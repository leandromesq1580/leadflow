'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  city: string
  state: string
  interest: string
  created_at: string
}

interface Buyer {
  id: string
  name: string
}

export default function AdminAppointmentsPage() {
  const [queue, setQueue] = useState<Lead[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBuyer, setSelectedBuyer] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [dateTime, setDateTime] = useState<Record<string, string>>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()

    // Leads waiting for appointment qualification
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .eq('product_type', 'appointment')
      .eq('status', 'new')
      .order('created_at', { ascending: true })

    // Active buyers with appointment credits
    const { data: buyersList } = await supabase
      .from('buyers')
      .select('id, name')
      .eq('is_active', true)
      .eq('is_admin', false)

    setQueue(leads || [])
    setBuyers(buyersList || [])
    setLoading(false)
  }

  async function scheduleAppointment(leadId: string) {
    const buyerId = selectedBuyer[leadId]
    const scheduledAt = dateTime[leadId]
    const qualNotes = notes[leadId]

    if (!buyerId || !scheduledAt) {
      alert('Selecione um comprador e data/hora')
      return
    }

    const supabase = createClient()

    // Create appointment
    await supabase.from('appointments').insert({
      lead_id: leadId,
      buyer_id: buyerId,
      scheduled_at: scheduledAt,
      qualification_notes: qualNotes || '',
      status: 'scheduled',
    })

    // Update lead
    await supabase.from('leads').update({
      status: 'appointment_set',
      assigned_to: buyerId,
      assigned_at: new Date().toISOString(),
    }).eq('id', leadId)

    // Decrement appointment credit
    const { data: credit } = await supabase
      .from('credits')
      .select('id, total_used')
      .eq('buyer_id', buyerId)
      .eq('type', 'appointment')
      .order('purchased_at', { ascending: true })
      .limit(1)
      .single()

    if (credit) {
      await supabase.from('credits').update({ total_used: credit.total_used + 1 }).eq('id', credit.id)
    }

    loadData()
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Fila de Appointments</h1>
      <p className="text-sm text-gray-500 mb-6">Leads para qualificar e agendar</p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : queue.length > 0 ? (
        <div className="space-y-4">
          {queue.map(lead => (
            <div key={lead.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">{lead.name}</h3>
                  <p className="text-sm text-gray-500">{lead.city}, {lead.state} — {lead.interest}</p>
                </div>
                <div className="text-right">
                  <a href={`tel:${lead.phone}`} className="text-blue-600 font-bold text-lg hover:underline">{lead.phone}</a>
                  <p className="text-xs text-gray-400">{lead.email}</p>
                </div>
              </div>

              <div className="bg-yellow-50 text-yellow-800 text-sm px-4 py-2 rounded-xl mb-4 font-medium">
                Recebido {timeAgo(lead.created_at)} — Ligar, qualificar e agendar
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Comprador</label>
                  <select
                    value={selectedBuyer[lead.id] || ''}
                    onChange={(e) => setSelectedBuyer({ ...selectedBuyer, [lead.id]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecionar...</option>
                    {buyers.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Data/Hora</label>
                  <input
                    type="datetime-local"
                    value={dateTime[lead.id] || ''}
                    onChange={(e) => setDateTime({ ...dateTime, [lead.id]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Notas</label>
                  <input
                    type="text"
                    value={notes[lead.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [lead.id]: e.target.value })}
                    placeholder="Brief do que o lead quer..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={() => scheduleAppointment(lead.id)}
                className="mt-4 bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors"
              >
                Agendar Appointment
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 font-medium">Fila vazia — todos os leads foram agendados</p>
        </div>
      )}
    </div>
  )
}
