import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'

/**
 * POST /api/admin/sms/dispatch — envia o PRÓXIMO lote de uma campanha.
 * Body: { campaign_id, batch?: number } (default 20)
 * O cliente chama em loop até remaining=0 (cada chamada fica curta — não
 * estoura o timeout serverless). Retorna progresso.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { campaign_id, batch = 20 } = await request.json().catch(() => ({} as any))
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 })

  const take = Math.min(Math.max(Number(batch) || 20, 1), 40)
  const { data: queued } = await db.from('sms_messages')
    .select('id, to_phone, body')
    .eq('campaign_id', campaign_id)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(take)

  let sent = 0, failed = 0
  for (const m of queued || []) {
    const r = await sendSms(m.to_phone, m.body)
    if (r.ok) {
      sent++
      await db.from('sms_messages').update({ status: 'sent', twilio_sid: r.sid || null }).eq('id', m.id)
    } else {
      failed++
      await db.from('sms_messages').update({ status: 'failed', error: (r.error || '').slice(0, 300) }).eq('id', m.id)
    }
    await new Promise(res => setTimeout(res, 120)) // ritmo ~8/s — não afoga o número
  }

  // Atualiza contadores + status da campanha
  const { count: remaining } = await db.from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign_id).eq('status', 'queued')
  const { count: totalSent } = await db.from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign_id).eq('status', 'sent')
  const { count: totalFailed } = await db.from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign_id).eq('status', 'failed')

  await db.from('sms_campaigns').update({
    sent: totalSent || 0,
    failed: totalFailed || 0,
    status: (remaining || 0) > 0 ? 'sending' : 'done',
  }).eq('id', campaign_id)

  return NextResponse.json({ sent, failed, remaining: remaining || 0, total_sent: totalSent || 0, total_failed: totalFailed || 0 })
}
