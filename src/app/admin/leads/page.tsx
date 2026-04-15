import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

function getLeadAge(createdAt: string): { days: number; label: string; color: string; bg: string } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return { days, label: 'Hoje', color: '#10b981', bg: '#ecfdf5' }
  if (days <= 3) return { days, label: `${days}d`, color: '#10b981', bg: '#ecfdf5' }
  if (days <= 7) return { days, label: `${days}d`, color: '#f59e0b', bg: '#fffbeb' }
  return { days, label: `${days}d`, color: '#ef4444', bg: '#fef2f2' }
}

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
  const cold = allLeads.filter(l => l.type === 'cold' && l.status === 'new').length
  const hot = allLeads.filter(l => l.type === 'hot' && l.status === 'new').length

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Todos os Leads</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            {allLeads.length} leads · {sold} vendidos · {hot} quentes na fila · {cold} frios
          </p>
        </div>
        <Link href="/admin/import" className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
          📥 Importar do Google Sheets
        </Link>
      </div>

      {/* Header row */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid #e8ecf4', background: '#f8f9fc' }}>
          <span className="w-9" />
          <span className="flex-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Lead</span>
          <span className="w-[40px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Estado</span>
          <span className="w-[50px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Idade</span>
          <span className="w-[40px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Temp</span>
          <span className="min-w-[100px] text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Comprador</span>
          <span className="w-[70px] text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Status</span>
        </div>
        {allLeads.length > 0 ? (
          <div>
            {allLeads.map((lead: any, i: number) => {
              const age = getLeadAge(lead.created_at)
              return (
                <div key={lead.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < allLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                    {getInitials(lead.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                    <p className="text-[11px]" style={{ color: '#94a3b8' }}>{lead.phone} · {lead.city}</p>
                  </div>
                  <span className="w-[40px] text-center px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
                    {lead.state || '?'}
                  </span>
                  <span className="w-[50px] text-center px-2 py-1 rounded-lg text-[11px] font-bold" style={{ background: age.bg, color: age.color }}>
                    {age.label}
                  </span>
                  <span className="w-[40px] text-center">
                    {lead.type === 'cold' ? (
                      <span className="text-[11px] font-bold" style={{ color: '#3b82f6' }}>❄️</span>
                    ) : (
                      <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>🔥</span>
                    )}
                  </span>
                  <span className="text-[12px] font-medium min-w-[100px]" style={{ color: '#64748b' }}>
                    {lead.buyer?.name || <span style={{ color: '#f59e0b' }}>Na fila</span>}
                  </span>
                  <span className="w-[70px]">
                    <Badge status={lead.status} />
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum lead</div>
        )}
      </div>
    </div>
  )
}
