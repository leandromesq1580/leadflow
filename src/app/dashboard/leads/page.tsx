import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  const { data: leads } = await db
    .from('leads')
    .select('*')
    .eq('assigned_to', buyer.id)
    .order('created_at', { ascending: false })

  const allLeads = leads || []
  const newCount = allLeads.filter(l => l.status === 'assigned').length
  const qualifiedCount = allLeads.filter(l => l.status === 'qualified').length

  return (
    <div className="max-w-[1040px]">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Meus Leads</h1>
        <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>{allLeads.length} leads no total</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        <span className="px-4 py-2 rounded-xl text-[13px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
          Todos ({allLeads.length})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          Novos ({newCount})
        </span>
        <span className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ color: '#64748b' }}>
          Qualificados ({qualifiedCount})
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {allLeads.length > 0 ? (
          <div>
            {allLeads.map((lead, i) => (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${lead.id}`}
                className="flex items-center gap-4 px-6 py-4 group"
                style={{ borderBottom: i < allLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                  {getInitials(lead.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold group-hover:text-indigo-600" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                  <p className="text-[12px]" style={{ color: '#94a3b8' }}>{lead.city}{lead.state ? `, ${lead.state}` : ''} · {lead.interest}</p>
                </div>
                <div className="hidden sm:block">
                  <span className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>{lead.phone}</span>
                </div>
                <div className="hidden md:block">
                  <span className="text-[12px]" style={{ color: '#94a3b8' }}>{lead.email}</span>
                </div>
                <Badge status={lead.status} />
                <span className="text-[12px] whitespace-nowrap" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
                <span className="text-[18px] opacity-0 group-hover:opacity-100" style={{ color: '#94a3b8' }}>›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#f1f5f9' }}>
              <span className="text-3xl">🔍</span>
            </div>
            <p className="text-[15px] font-semibold" style={{ color: '#1a1a2e' }}>Nenhum lead encontrado</p>
            <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>Leads aparecem aqui quando sao distribuidos pra voce</p>
          </div>
        )}
      </div>
    </div>
  )
}
