import { createServerSupabase } from '@/lib/supabase/server'
import { BulkDeleteManual } from '@/components/bulk-delete-manual'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getLocale } from '@/lib/locale'
import { LeadActions } from './lead-actions'
import { LeadsList } from './leads-list'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
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
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Meus Leads', 'My Leads', 'Mis Leads')}</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>{allLeads.length} {L('leads no total', 'leads in total', 'leads en total')}</p>
        </div>
        <div className="flex items-center gap-2">
          <BulkDeleteManual />
          <LeadActions />
        </div>
      </div>

      {/* Agency manual mode alert */}
      {isManual && unassignedCount > 0 && (
        <div className="rounded-xl p-4 mb-5 flex items-center gap-3" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <span className="text-[20px]">⚡</span>
          <div>
            <p className="text-[13px] font-bold" style={{ color: '#92400e' }}>
              {unassignedCount} {unassignedCount > 1
                ? L('leads sem agente atribuido', 'leads without an assigned agent', 'leads sin agente asignado')
                : L('lead sem agente atribuido', 'lead without an assigned agent', 'lead sin agente asignado')}
            </p>
            <p className="text-[12px]" style={{ color: '#a16207' }}>{L('Clique em "Atribuir" pra enviar pro agente do seu time.', 'Click "Assign" to send it to an agent on your team.', 'Haz clic en "Asignar" para enviarlo a un agente de tu equipo.')}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <span className="px-4 py-2 rounded-xl text-[13px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
          {L('Todos', 'All', 'Todos')} ({allLeads.length})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          {L('Novos', 'New', 'Nuevos')} ({newCount})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          {L('Qualificados', 'Qualified', 'Calificados')} ({qualifiedCount})
        </span>
        {buyer.is_agency && (
          <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#f59e0b' }}>
            {L('Sem Agente', 'Unassigned', 'Sin Agente')} ({unassignedCount})
          </span>
        )}
      </div>

      <LeadsList leads={allLeads as any} isAgency={!!buyer.is_agency} teamMembers={teamMembers} />
    </div>
  )
}
