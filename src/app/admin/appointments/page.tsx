import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppointmentActions } from './appointment-actions'

export const dynamic = 'force-dynamic'

export default async function AdminAppointmentsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // Leads waiting for appointment qualification
  const { data: queue } = await db
    .from('leads')
    .select('*')
    .eq('product_type', 'appointment')
    .eq('status', 'new')
    .order('created_at', { ascending: true })

  // Get eligible buyers with appointment credits + states + availability
  const { data: allBuyers } = await db
    .from('buyers')
    .select('id, name, email')
    .eq('is_active', true)
    .eq('is_admin', false)

  // Get states and availability for each buyer
  const buyersWithDetails = await Promise.all((allBuyers || []).map(async (b) => {
    const { data: credits } = await db.from('credits').select('total_purchased, total_used').eq('buyer_id', b.id).eq('type', 'appointment')
    const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', b.id)
    const { data: avail } = await db.from('buyer_availability').select('day_type, period').eq('buyer_id', b.id)

    const remaining = credits?.reduce((s, c) => s + c.total_purchased - c.total_used, 0) || 0

    return {
      ...b,
      remaining,
      states: states?.map(s => s.state_code) || [],
      availability: avail || [],
    }
  }))

  // Recent completed appointments
  const { data: completedAppts } = await db
    .from('appointments')
    .select('*, lead:leads(name, phone), buyer:buyers(name)')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="max-w-[1100px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Fila de Appointments</h1>
      <p className="text-[14px] mb-8" style={{ color: '#64748b' }}>Leads para qualificar e agendar na agenda dos compradores</p>

      {/* Queue */}
      {queue && queue.length > 0 ? (
        <div className="space-y-4 mb-8">
          {queue.map(lead => {
            // Filter buyers eligible for this lead's state
            const eligible = buyersWithDetails.filter(b =>
              b.remaining > 0 && (b.states.length === 0 || b.states.includes(lead.state || ''))
            )

            return (
              <div key={lead.id} className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[14px] font-bold text-white"
                      style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                      {getInitials(lead.name)}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold" style={{ color: '#1a1a2e' }}>{lead.name}</h3>
                      <p className="text-[13px]" style={{ color: '#64748b' }}>{lead.city}, {lead.state} · {lead.interest}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <a href={`tel:${lead.phone}`} className="text-[16px] font-bold" style={{ color: '#6366f1' }}>{lead.phone}</a>
                    <p className="text-[12px]" style={{ color: '#94a3b8' }}>{lead.email}</p>
                  </div>
                </div>

                <div className="rounded-xl px-4 py-2 mb-4" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p className="text-[12px] font-semibold" style={{ color: '#92400e' }}>
                    ⏳ Recebido {timeAgo(lead.created_at)} · {eligible.length} comprador{eligible.length !== 1 ? 'es' : ''} elegivel{eligible.length !== 1 ? 'is' : ''}
                  </p>
                </div>

                {eligible.length > 0 ? (
                  <AppointmentActions leadId={lead.id} buyers={eligible.map(b => ({
                    id: b.id,
                    name: b.name,
                    remaining: b.remaining,
                    states: b.states,
                    availability: b.availability.map((a: any) => `${a.day_type}:${a.period}`),
                  }))} />
                ) : (
                  <p className="text-[13px] font-semibold" style={{ color: '#ef4444' }}>
                    Nenhum comprador elegivel para {lead.state || 'este estado'} com creditos de appointment
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl text-center py-16 mb-8" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#ecfdf5' }}>
            <span className="text-3xl">✅</span>
          </div>
          <p className="text-[15px] font-semibold" style={{ color: '#1a1a2e' }}>Fila vazia</p>
          <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>Todos os appointments foram agendados</p>
        </div>
      )}

      {/* Completed */}
      {completedAppts && completedAppts.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
            <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Appointments Recentes</h2>
          </div>
          {completedAppts.map((appt: any, i: number) => (
            <div key={appt.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < completedAppts.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{appt.lead?.name}</span>
              <span className="text-[12px]" style={{ color: '#94a3b8' }}>→</span>
              <span className="text-[13px] font-medium" style={{ color: '#64748b' }}>{appt.buyer?.name}</span>
              <div className="flex-1" />
              <Badge status={appt.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
