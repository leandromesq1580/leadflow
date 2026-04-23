import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { LeadActions } from './lead-actions'
import { LeadsList } from './leads-list'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, is_agency, team_distribution_mode').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  const { data: leads } = await db
    .from('leads')
    .select('*, member:team_members!assigned_to_member(id, name)')
    .eq('assigned_to', buyer.id)
    .order('created_at', { ascending: false })

  // Get team members for assign dropdown (if agency + manual mode)
  let teamMembers: { id: string; name: string }[] = []
  if (buyer.is_agency) {
    const { data } = await db.from('team_members').select('id, name').eq('buyer_id', buyer.id).eq('is_active', true).order('name')
    teamMembers = data || []
  }

  const allLeads = leads || []
  const newCount = allLeads.filter(l => l.status === 'assigned').length
  const qualifiedCount = allLeads.filter(l => l.status === 'qualified').length
  const unassignedCount = allLeads.filter(l => !l.assigned_to_member).length
  const isManual = buyer.is_agency && buyer.team_distribution_mode === 'manual'

  return (
    <div className="max-w-[1040px]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Meus Leads</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>{allLeads.length} leads no total</p>
        </div>
        <LeadActions />
      </div>

      {/* Agency manual mode alert */}
      {isManual && unassignedCount > 0 && (
        <div className="rounded-xl p-4 mb-5 flex items-center gap-3" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <span className="text-[20px]">⚡</span>
          <div>
            <p className="text-[13px] font-bold" style={{ color: '#92400e' }}>
              {unassignedCount} lead{unassignedCount > 1 ? 's' : ''} sem agente atribuido
            </p>
            <p className="text-[12px]" style={{ color: '#a16207' }}>Clique em "Atribuir" pra enviar pro agente do seu time.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <span className="px-4 py-2 rounded-xl text-[13px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
          Todos ({allLeads.length})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          Novos ({newCount})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          Qualificados ({qualifiedCount})
        </span>
        {buyer.is_agency && (
          <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#f59e0b' }}>
            Sem Agente ({unassignedCount})
          </span>
        )}
      </div>

      <LeadsList leads={allLeads as any} isAgency={!!buyer.is_agency} teamMembers={teamMembers} />
    </div>
  )
}
