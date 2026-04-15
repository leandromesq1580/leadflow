import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminLeadsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: leads } = await db
    .from('leads')
    .select('*, buyer:buyers!assigned_to(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const allLeads = leads || []
  const available = allLeads.filter(l => l.status === 'new').length
  const sold = allLeads.filter(l => l.status !== 'new').length

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Todos os Leads</h1>
        <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>{allLeads.length} leads · {available} na fila · {sold} vendidos</p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        {allLeads.length > 0 ? (
          <div>
            {allLeads.map((lead: any, i: number) => (
              <div key={lead.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < allLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                  {getInitials(lead.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{lead.phone} · {lead.email}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>{lead.state || '?'}</span>
                <span className="text-[12px] font-medium min-w-[100px]" style={{ color: '#64748b' }}>
                  {lead.buyer?.name || <span style={{ color: '#f59e0b' }}>Na fila</span>}
                </span>
                <Badge status={lead.product_type === 'appointment' ? 'scheduled' : lead.status}>
                  {lead.product_type === 'appointment' ? 'Appt' : undefined}
                </Badge>
                <Badge status={lead.status} />
                <span className="text-[11px] whitespace-nowrap" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum lead</div>
        )}
      </div>
    </div>
  )
}
