import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { formatDate, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: buyer } = await db.from('buyers').select('*').eq('id', id).single()
  if (!buyer) return <p>Comprador nao encontrado</p>

  const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', id)
  const { data: availability } = await db.from('buyer_availability').select('day_type, period').eq('buyer_id', id)
  const { data: credits } = await db.from('credits').select('*').eq('buyer_id', id).order('purchased_at', { ascending: false })
  const { data: leads } = await db.from('leads').select('id, name, city, state, status, created_at').eq('assigned_to', id).order('created_at', { ascending: false }).limit(10)
  const { data: appointments } = await db.from('appointments').select('*, lead:leads(name, phone)').eq('buyer_id', id).order('scheduled_at', { ascending: false }).limit(5)

  const leadCredits = credits?.filter(c => c.type === 'lead') || []
  const apptCredits = credits?.filter(c => c.type === 'appointment') || []
  const totalLeadCredits = leadCredits.reduce((s, c) => s + c.total_purchased, 0)
  const usedLeadCredits = leadCredits.reduce((s, c) => s + c.total_used, 0)
  const totalApptCredits = apptCredits.reduce((s, c) => s + c.total_purchased, 0)
  const usedApptCredits = apptCredits.reduce((s, c) => s + c.total_used, 0)

  const dayLabels: Record<string, string> = { weekday: 'Seg-Sex', saturday: 'Sabado', sunday: 'Domingo', holiday: 'Feriados' }
  const periodLabels: Record<string, string> = { morning: 'Manha', afternoon: 'Tarde', evening: 'Noite' }

  return (
    <div className="max-w-[900px]">
      <Link href="/admin/buyers" className="text-[13px] font-medium mb-6 inline-block" style={{ color: '#6366f1' }}>← Voltar</Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-[20px] font-bold text-white"
          style={{ background: `hsl(${(buyer.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
          {getInitials(buyer.name)}
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-extrabold" style={{ color: '#1a1a2e' }}>{buyer.name}</h1>
          <p className="text-[14px]" style={{ color: '#64748b' }}>{buyer.email} · {buyer.phone}</p>
        </div>
        <Badge status={buyer.is_active ? 'active' : 'pending'} />
      </div>

      {/* Credits */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Creditos Lead</p>
          <p className="text-[28px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>
            {totalLeadCredits - usedLeadCredits} <span className="text-[14px] font-normal" style={{ color: '#94a3b8' }}>/ {totalLeadCredits}</span>
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Creditos Appointment</p>
          <p className="text-[28px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>
            {totalApptCredits - usedApptCredits} <span className="text-[14px] font-normal" style={{ color: '#94a3b8' }}>/ {totalApptCredits}</span>
          </p>
        </div>
      </div>

      {/* States */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>📍 Estados com Licenca</h2>
        {states && states.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {states.map(s => (
              <span key={s.state_code} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white" style={{ background: '#6366f1' }}>
                {s.state_code}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: '#f59e0b' }}>Nenhum estado configurado — nao recebera leads</p>
        )}
      </div>

      {/* Availability */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>📅 Disponibilidade Appointments</h2>
        {availability && availability.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {availability.map((a: any) => (
              <span key={`${a.day_type}_${a.period}`} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: '#eef2ff', color: '#6366f1' }}>
                {dayLabels[a.day_type]} · {periodLabels[a.period]}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: '#94a3b8' }}>Nenhuma disponibilidade configurada</p>
        )}
      </div>

      {/* Leads */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Leads Recebidos ({leads?.length || 0})</h2>
        </div>
        {leads && leads.length > 0 ? (
          <div>
            {leads.map((lead: any, i: number) => (
              <div key={lead.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < leads.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                  {getInitials(lead.name)}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{lead.city}, {lead.state}</p>
                </div>
                <Badge status={lead.status} />
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>{formatDate(lead.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum lead recebido</p>
        )}
      </div>
    </div>
  )
}
