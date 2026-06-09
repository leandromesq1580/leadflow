import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadNotificationEmail } from '@/lib/notifications'
import { migrateWhatsAppOwnership } from '@/lib/lead-ownership'

/**
 * POST /api/admin/reassign-lead — repassa um lead pra outro agente (buyer).
 * Body: { lead_id, to_buyer_id }
 * O lead SAI do pipeline do dono atual e ENTRA no inicio do pipeline do novo dono.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { lead_id, to_buyer_id } = await request.json()
  if (!lead_id || !to_buyer_id) return NextResponse.json({ error: 'Missing lead_id ou to_buyer_id' }, { status: 400 })

  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()
  if (!lead) return NextResponse.json({ error: 'Lead nao encontrado' }, { status: 404 })
  if (lead.assigned_to === to_buyer_id) return NextResponse.json({ error: 'Lead ja pertence a esse agente' }, { status: 400 })

  const { data: toBuyer } = await db.from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .eq('id', to_buyer_id).single()
  if (!toBuyer) return NextResponse.json({ error: 'Agente destino nao encontrado' }, { status: 404 })

  // 1) Reatribui o lead (limpa member tambem — repasse e entre agentes/buyers)
  await db.from('leads').update({
    assigned_to: to_buyer_id,
    assigned_to_member: null,
    assigned_at: new Date().toISOString(),
    status: 'assigned',
  }).eq('id', lead_id)

  // 2) Sai de TODOS os pipelines atuais (remove do pipeline do dono antigo)
  await db.from('pipeline_leads').delete().eq('lead_id', lead_id)

  // 3) Entra no INICIO do pipeline padrao do novo agente (primeiro estagio)
  const { data: pipe } = await db.from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', to_buyer_id).eq('is_default', true).maybeSingle()
  if (pipe?.stages?.length) {
    const firstStage = (pipe.stages as any[]).sort((a, b) => a.position - b.position)[0]
    await db.from('pipeline_leads').upsert({
      lead_id, pipeline_id: pipe.id, stage_id: firstStage.id,
      position: 0, moved_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,pipeline_id' })
  }

  // 4) Privacidade: thread do WhatsApp passa pro novo dono (o antigo nao ve msgs futuras)
  try { await migrateWhatsAppOwnership(db, lead_id, to_buyer_id) } catch (e) { console.error('[Reassign] WA migrate:', (e as any)?.message) }

  // 5) Notifica o novo agente (email + WhatsApp, como na distribuicao normal)
  try { await sendLeadNotificationEmail(toBuyer as any, lead) } catch (e) { console.error('[Reassign] notify:', (e as any)?.message) }

  return NextResponse.json({ success: true, to: toBuyer.name })
}
