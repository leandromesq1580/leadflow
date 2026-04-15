import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { formatDate, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: lead } = await db
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) {
    return (
      <div className="max-w-3xl">
        <Link href="/dashboard/leads" className="text-[13px] font-medium" style={{ color: '#6366f1' }}>← Voltar</Link>
        <p className="text-center py-20" style={{ color: '#94a3b8' }}>Lead nao encontrado</p>
      </div>
    )
  }

  const { data: activities } = await db
    .from('lead_activity')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/leads" className="text-[13px] font-medium mb-6 inline-block" style={{ color: '#6366f1' }}>
        ← Voltar para lista
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-[16px] font-bold text-white"
            style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
            {getInitials(lead.name)}
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold" style={{ color: '#1a1a2e' }}>{lead.name}</h1>
            <p className="text-[14px]" style={{ color: '#64748b' }}>{lead.city}{lead.state ? `, ${lead.state}` : ''} — {lead.interest}</p>
          </div>
        </div>
        <Badge status={lead.status} />
      </div>

      {/* Contact Info */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Informacoes do Lead</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Telefone</p>
            <a href={`tel:${lead.phone}`} className="text-[15px] font-bold block mt-1" style={{ color: '#6366f1' }}>
              {lead.phone || '—'}
            </a>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Email</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: '#1a1a2e' }}>{lead.email || '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Interesse</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: '#1a1a2e' }}>{lead.interest}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Campanha</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: '#1a1a2e' }}>{lead.campaign_name || '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Tipo</p>
            <Badge status={lead.type} />
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f8f9fc' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Recebido em</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: '#1a1a2e' }}>{formatDate(lead.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Activity History */}
      <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Historico</h2>
        {activities && activities.length > 0 ? (
          <div className="space-y-4">
            {activities.map((act: any) => (
              <div key={act.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: '#6366f1' }} />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{act.action}</p>
                  {act.notes && <p className="text-[13px] mt-0.5" style={{ color: '#64748b' }}>{act.notes}</p>}
                  <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{formatDate(act.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: '#94a3b8' }}>Nenhuma atividade registrada</p>
        )}
      </div>
    </div>
  )
}
