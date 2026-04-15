import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BuyersPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: buyers } = await db
    .from('buyers')
    .select('*')
    .eq('is_admin', false)
    .order('created_at', { ascending: false })

  // Get states and credits for each buyer
  const buyerData = await Promise.all((buyers || []).map(async (b) => {
    const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', b.id)
    const { data: credits } = await db.from('credits').select('type, total_purchased, total_used').eq('buyer_id', b.id)
    const { count: leadCount } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', b.id)

    const leadCreds = credits?.filter(c => c.type === 'lead') || []
    const apptCreds = credits?.filter(c => c.type === 'appointment') || []

    return {
      ...b,
      states: states?.map(s => s.state_code) || [],
      leadCredits: leadCreds.reduce((s, c) => s + c.total_purchased - c.total_used, 0),
      apptCredits: apptCreds.reduce((s, c) => s + c.total_purchased - c.total_used, 0),
      leadsReceived: leadCount || 0,
    }
  }))

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Compradores</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>{buyerData.length} comprador{buyerData.length !== 1 ? 'es' : ''} cadastrado{buyerData.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        {buyerData.length > 0 ? (
          <div>
            {buyerData.map((b, i) => (
              <Link
                key={b.id}
                href={`/admin/buyers/${b.id}`}
                className="flex items-center gap-4 px-6 py-4 group hover:bg-slate-50"
                style={{ borderBottom: i < buyerData.length - 1 ? '1px solid #f1f5f9' : 'none' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: `hsl(${(b.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                  {getInitials(b.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold group-hover:text-indigo-600" style={{ color: '#1a1a2e' }}>{b.name}</p>
                  <p className="text-[12px]" style={{ color: '#94a3b8' }}>{b.email}</p>
                </div>
                <div className="flex gap-1">
                  {b.states.slice(0, 5).map((s: string) => (
                    <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>{s}</span>
                  ))}
                  {b.states.length > 5 && <span className="text-[10px] font-bold" style={{ color: '#94a3b8' }}>+{b.states.length - 5}</span>}
                  {b.states.length === 0 && <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>Sem estado</span>}
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{b.leadCredits} leads</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{b.apptCredits} appts</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold" style={{ color: '#64748b' }}>{b.leadsReceived} recebidos</p>
                </div>
                <Badge status={b.is_active ? 'active' : 'pending'} />
                <span className="text-[18px] opacity-0 group-hover:opacity-100" style={{ color: '#94a3b8' }}>›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-[15px] font-semibold" style={{ color: '#1a1a2e' }}>Nenhum comprador</p>
          </div>
        )}
      </div>
    </div>
  )
}
