'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

interface Appointment {
  id: string
  scheduled_at: string
  status: string
  qualification_notes: string
  lead: { name: string; phone: string; city: string; state: string; interest: string }
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [])

  async function loadAppointments() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: buyer } = await supabase
      .from('buyers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!buyer) return

    const { data } = await supabase
      .from('appointments')
      .select('*, lead:leads(name, phone, city, state, interest)')
      .eq('buyer_id', buyer.id)
      .order('scheduled_at', { ascending: false })

    setAppointments(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status }).eq('id', id)
    loadAppointments()
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Appointments</h1>
      <p className="text-sm text-gray-500 mb-6">Reunioes agendadas com leads qualificados</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : appointments.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Telefone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Data/Hora</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Interesse</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <tr key={appt.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-sm">{appt.lead?.name}</p>
                    <p className="text-xs text-gray-400">{appt.lead?.city}, {appt.lead?.state}</p>
                  </td>
                  <td className="px-5 py-3">
                    <a href={`tel:${appt.lead?.phone}`} className="text-sm text-blue-600 font-medium">
                      {appt.lead?.phone}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {formatDate(appt.scheduled_at)}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{appt.lead?.interest}</td>
                  <td className="px-5 py-3"><Badge status={appt.status} /></td>
                  <td className="px-5 py-3">
                    {appt.status === 'scheduled' || appt.status === 'confirmed' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(appt.id, 'completed')}
                          className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-green-100"
                        >
                          Realizada
                        </button>
                        <button
                          onClick={() => updateStatus(appt.id, 'no_show')}
                          className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-100"
                        >
                          No-show
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-500 font-medium">Nenhum appointment ainda</p>
            <p className="text-sm text-gray-400 mt-1">Appointments aparecem aqui quando nossa equipe agenda para voce</p>
          </div>
        )}
      </div>

      {appointments.some(a => a.qualification_notes) && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Briefs dos Appointments</h2>
          <div className="space-y-3">
            {appointments.filter(a => a.qualification_notes).map(appt => (
              <div key={appt.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-sm font-semibold">{appt.lead?.name} — {formatDate(appt.scheduled_at)}</p>
                <p className="text-sm text-gray-500 mt-1">{appt.qualification_notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
