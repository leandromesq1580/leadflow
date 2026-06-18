import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { twilioConfigured } from '@/lib/twilio'
import { SmsClient } from './sms-client'

export const dynamic = 'force-dynamic'

export default async function AdminSmsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // Tolera migration 017 ainda não aplicada (tabelas ausentes → listas vazias)
  let campaigns: any[] = []
  let replies: any[] = []
  let migrated = true
  {
    const c = await db.from('sms_campaigns').select('*').order('created_at', { ascending: false }).limit(30)
    if (c.error) migrated = false
    else campaigns = c.data || []
    if (migrated) {
      const r = await db.from('sms_messages')
        .select('id, from_phone, body, created_at, lead:leads(id, name, state)')
        .eq('direction', 'in')
        .order('created_at', { ascending: false })
        .limit(500)
      replies = (r.data || []).map((m: any) => ({
        id: m.id,
        from_phone: m.from_phone,
        body: m.body,
        created_at: m.created_at,
        lead_name: m.lead?.name || null,
        lead_id: m.lead?.id || null,
        lead_state: m.lead?.state || null,
      }))
    }
  }

  const { data: buyers } = await db.from('buyers').select('id, name').eq('is_active', true).order('name')

  return (
    <div className="max-w-[1000px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>✉️ SMS em Massa</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>
        Dispare SMS pra um conjunto de leads e acompanhe as respostas aqui (e no grupo do WhatsApp)
      </p>

      {!twilioConfigured() && (
        <div className="rounded-xl px-5 py-4 mb-6" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <p className="text-[13px] font-bold mb-1" style={{ color: '#92400e' }}>⚠️ Twilio não configurado</p>
          <p className="text-[12px]" style={{ color: '#92400e' }}>
            Adicione nas variáveis de ambiente: <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> e <code>TWILIO_FROM_NUMBER</code> (ou <code>TWILIO_MESSAGING_SERVICE_SID</code>). Dá pra calcular o público mesmo sem isso, mas o disparo fica bloqueado.
          </p>
        </div>
      )}

      {!migrated && (
        <div className="rounded-xl px-5 py-4 mb-6" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-[13px] font-bold mb-1" style={{ color: '#dc2626' }}>Migração pendente</p>
          <p className="text-[12px]" style={{ color: '#dc2626' }}>
            Rode a migration <code>017_sms.sql</code> no Supabase (SQL Editor) pra criar as tabelas de SMS.
          </p>
        </div>
      )}

      <SmsClient campaigns={campaigns} replies={replies} buyers={buyers || []} />
    </div>
  )
}
