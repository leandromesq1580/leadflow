import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'
import { getLocale } from '@/lib/locale'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const dateLocale = locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR'
  const formatDate = (date: string | Date) => new Intl.DateTimeFormat(dateLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
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
        <Link href="/dashboard/leads" className="text-[13px] font-medium" style={{ color: '#6366f1' }}>{L('← Voltar', '← Back', '← Volver')}</Link>
        <p className="text-center py-20" style={{ color: 'var(--fg-muted)' }}>{L('Lead nao encontrado', 'Lead not found', 'Lead no encontrado')}</p>
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
        {L('← Voltar para lista', '← Back to list', '← Volver a la lista')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-[16px] font-bold text-white"
            style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
            {getInitials(lead.name)}
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--fg)' }}>{lead.name}</h1>
            <p className="text-[14px]" style={{ color: 'var(--fg-secondary)' }}>{lead.city}{lead.state ? `, ${lead.state}` : ''} — {lead.interest}</p>
          </div>
        </div>
        <Badge status={lead.status} />
      </div>

      {/* Contact Info */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('Informacoes do Lead', 'Lead Information', 'Información del Lead')}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Telefone', 'Phone', 'Teléfono')}</p>
            <a href={`tel:${lead.phone}`} className="text-[15px] font-bold block mt-1" style={{ color: '#6366f1' }}>
              {lead.phone || '—'}
            </a>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Email</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: 'var(--fg)' }}>{lead.email || '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Interesse', 'Interest', 'Interés')}</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: 'var(--fg)' }}>{lead.interest}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Campanha', 'Campaign', 'Campaña')}</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: 'var(--fg)' }}>{lead.campaign_name || '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Tipo', 'Type', 'Tipo')}</p>
            <Badge status={lead.type} />
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Recebido em', 'Received on', 'Recibido el')}</p>
            <p className="text-[14px] font-semibold mt-1" style={{ color: 'var(--fg)' }}>{formatDate(lead.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Activity History */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('Historico', 'History', 'Historial')}</h2>
        {activities && activities.length > 0 ? (
          <div className="space-y-4">
            {activities.map((act: any) => (
              <div key={act.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: '#6366f1' }} />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>{act.action}</p>
                  {act.notes && <p className="text-[13px] mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{act.notes}</p>}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>{formatDate(act.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhuma atividade registrada', 'No activity recorded', 'Ninguna actividad registrada')}</p>
        )}
      </div>
    </div>
  )
}
