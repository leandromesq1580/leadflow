import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadNotificationEmail } from '@/lib/notifications'
import { migrateWhatsAppOwnership } from '@/lib/lead-ownership'

/**
 * POST /api/admin/reassign-lead — repassa um lead pra outro agente (buyer).
 * Body: { lead_id, to_buyer_id }
 * REGRA: reatribuição pelo admin DEBITA 1 crédito de lead do comprador que recebe
 * (qualquer lead, sistema ou manual). Sem crédito → BLOQUEIA (avisa, não manda).
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

  // `notification_phone_2` só existe após a migration 031. Sem a coluna, o PostgREST
  // devolve 400 → toBuyer vira null → "Agente destino nao encontrado" (o repasse
  // quebrava inteiro). Fallback: sem a coluna, segue sem o 2º número.
  const TO_COLS = 'id, name, email, phone, notification_email, notification_sms, is_admin'
  let toRes = await db.from('buyers').select(`${TO_COLS}, notification_phone_2`).eq('id', to_buyer_id).single()
  if (toRes.error) toRes = await db.from('buyers').select(TO_COLS).eq('id', to_buyer_id).single()
  const toBuyer = toRes.data
  if (!toBuyer) return NextResponse.json({ error: 'Agente destino nao encontrado' }, { status: 404 })

  // 💳 CHECA CRÉDITO ANTES de mover nada. Sem saldo de lead → bloqueia (avisa o admin).
  // EXCEÇÃO: agente ADMINISTRADOR (is_admin) é ISENTO da trava — não checa nem debita.
  const isAdminAgent = !!toBuyer.is_admin
  let debitRow: any = null, remaining = 0
  if (!isAdminAgent) {
    const { data: creds } = await db.from('credits')
      .select('id, total_purchased, total_used, expires_at').eq('buyer_id', to_buyer_id).eq('type', 'lead')
    const nowMs = Date.now()
    for (const c of (creds || [])) {
      const rem = (Number(c.total_purchased) || 0) - (Number(c.total_used) || 0)
      const notExpired = !c.expires_at || new Date(c.expires_at).getTime() > nowMs
      if (notExpired && rem > 0) {
        remaining += rem
        const best = debitRow ? (Number(debitRow.total_purchased) || 0) - (Number(debitRow.total_used) || 0) : -1
        if (rem > best) debitRow = c
      }
    }
    if (!debitRow || remaining <= 0) {
      return NextResponse.json({ error: `${(toBuyer.name || '').trim()} está sem crédito de lead — não dá pra reatribuir. Adicione crédito ou escolha outro agente.`, code: 'NO_CREDIT' }, { status: 409 })
    }
  }

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

  // 4) Privacidade: thread do WhatsApp passa pro novo dono
  try { await migrateWhatsAppOwnership(db, lead_id, to_buyer_id) } catch (e) { console.error('[Reassign] WA migrate:', (e as any)?.message) }

  // 5) Debita 1 crédito de lead do novo dono (reatribuição = entrega que cobra).
  //    Admin é ISENTO (debitRow fica null pra ele) → não debita.
  if (!isAdminAgent && debitRow) {
    await db.from('credits').update({ total_used: (Number(debitRow.total_used) || 0) + 1 }).eq('id', debitRow.id)
  }

  // 5b) REFUND ao dono ANTERIOR: ele perdeu o lead → o credito dele VOLTA (espelha o
  //     debito do novo dono). Sem isso, toda reatribuicao VAZA 1 credito do perdedor
  //     (caso Fabiany: o lead saiu dela e o saldo ficou 4 em vez de 5). So pra lead
  //     AUTOMATICO (manual nao debita) + dono anterior nao-admin; nunca abaixo de 0.
  const prevOwner = (lead as any).assigned_to
  const leadIsManual = (lead as any).raw_data?.source === 'manual' || lead.campaign_name === 'Manual' || lead.form_name === 'manual_entry'
  if (prevOwner && prevOwner !== to_buyer_id && !leadIsManual) {
    const { data: prevAdmin } = await db.from('buyers').select('is_admin').eq('id', prevOwner).maybeSingle()
    if (!prevAdmin?.is_admin) {
      const { data: pc } = await db.from('credits')
        .select('id, total_used').eq('buyer_id', prevOwner).eq('type', 'lead').gt('total_used', 0)
        .order('total_used', { ascending: false }).limit(1)
      if (pc && pc[0]) {
        await db.from('credits').update({ total_used: Math.max(0, (Number(pc[0].total_used) || 0) - 1) }).eq('id', pc[0].id)
        console.log(`[Reassign] refund 1 credito ao dono anterior ${prevOwner} (perdeu o lead ${lead_id}).`)
      }
    }
  }

  // 6) Notifica o novo agente
  try { await sendLeadNotificationEmail(toBuyer as any, lead) } catch (e) { console.error('[Reassign] notify:', (e as any)?.message) }

  return NextResponse.json({ success: true, to: (toBuyer.name || '').trim(), credito_debitado: !isAdminAgent, saldo_restante: isAdminAgent ? null : remaining - 1, admin_isento: isAdminAgent })
}
