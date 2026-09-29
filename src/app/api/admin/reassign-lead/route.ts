import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadNotificationEmail } from '@/lib/notifications'
import { leadLanguageForLead, leadLanguageLabel } from '@/lib/lead-language'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

// Preserve PostgreSQL microseconds; Date alone loses the last three digits.
function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null
  const day = new Date(`${match[1]}T00:00:00Z`)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null
  return BigInt(ms) * BigInt(1000) + BigInt((match[5] || '').padEnd(6, '0').slice(3))
}

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

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body')
    body = parsed
  } catch {
    return NextResponse.json({ error: 'Corpo JSON invalido' }, { status: 400 })
  }
  const { lead_id, to_buyer_id, refund_previous = true, notify_target = true,
    expected_owner_id, expected_updated_at, reason } = body
  if (!isUuid(lead_id) || !isUuid(to_buyer_id) || typeof refund_previous !== 'boolean' || typeof notify_target !== 'boolean') {
    return NextResponse.json({ error: 'IDs ou opcoes invalidos' }, { status: 400 })
  }
  if (!refund_previous && (!isUuid(expected_owner_id) || timestampMicros(expected_updated_at) === null || typeof reason !== 'string' || !reason.trim())) {
    return NextResponse.json({ error: 'Sem reembolso exige expected_owner_id, expected_updated_at e reason' }, { status: 400 })
  }

  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()
  if (!lead) return NextResponse.json({ error: 'Lead nao encontrado' }, { status: 404 })
  const language = leadLanguageForLead(lead)
  if (!language) return NextResponse.json({ error: 'Confirme o idioma deste lead antes de reatribuir.' }, { status: 409 })
  if (lead.assigned_to === to_buyer_id) return NextResponse.json({ error: 'Lead ja pertence a esse agente' }, { status: 400 })
  if (!refund_previous && (lead.assigned_to !== expected_owner_id || timestampMicros(lead.updated_at) !== timestampMicros(expected_updated_at))) {
    return NextResponse.json({ error: 'Lead alterado desde a selecao', code: 'CONFLICT' }, { status: 409 })
  }

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
  const isAdminAgent = toBuyer.is_admin === true
  if (!refund_previous && !isAdminAgent) {
    return NextResponse.json({ error: 'Sem reembolso permitido somente para destino administrador' }, { status: 400 })
  }
  let debitRow: { id: string; total_purchased: number; total_used: number; expires_at: string | null } | null = null, remaining = 0
  if (!isAdminAgent) {
    const { data: creds } = await db.from('credits')
      .select('id, total_purchased, total_used, expires_at').eq('buyer_id', to_buyer_id).eq('type', 'lead')
      .eq('lead_language', language)
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
      return NextResponse.json({ error: `${(toBuyer.name || '').trim()} está sem crédito para ${leadLanguageLabel(language)}. Adicione crédito desse idioma ou escolha outro agente.`, code: 'NO_CREDIT' }, { status: 409 })
    }
  }

  const { data: pipe, error: pipeError } = await db.from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', to_buyer_id).eq('is_default', true).maybeSingle()
  if (pipeError) return NextResponse.json({ error: 'Falha ao consultar pipeline' }, { status: 503 })
  if (!pipe?.stages?.length) return NextResponse.json({ error: 'Destino sem pipeline padrao e estagio inicial' }, { status: 409 })
  const firstStage = [...pipe.stages].sort((a, b) => a.position - b.position)[0]

  let failedStep = 'leads.update'
  let partial = false
  const failure = () => NextResponse.json({
    success: false, error: 'Repasse interrompido; conferir estado antes de repetir.',
    failed_step: failedStep, partial, reconcile_required: true,
  }, { status: 503 })
  try {
  // 1) Reatribui o lead (limpa member tambem — repasse e entre agentes/buyers)
  let update = db.from('leads').update({
    assigned_to: to_buyer_id,
    assigned_to_member: null,
    assigned_at: new Date().toISOString(),
    status: 'assigned',
    delivery_credit_id: debitRow?.id || null,
  }).eq('id', lead_id)
  update = lead.assigned_to === null ? update.is('assigned_to', null) : update.eq('assigned_to', lead.assigned_to)
  const { data: moved, error: moveError } = await update.eq('updated_at', lead.updated_at).select('id').maybeSingle()
  if (moveError) return failure()
  if (!moved) return NextResponse.json({ error: 'Lead alterado durante o repasse', code: 'CONFLICT' }, { status: 409 })

  partial = true
  failedStep = 'pipeline_leads.delete'
  // 2) Sai de TODOS os pipelines atuais (remove do pipeline do dono antigo)
  const { error: deleteError } = await db.from('pipeline_leads').delete().eq('lead_id', lead_id)
  if (deleteError) return failure()

  // 3) Entra no inicio do pipeline previamente validado.
  failedStep = 'pipeline_leads.upsert'
  const { error: cardError } = await db.from('pipeline_leads').upsert({
    lead_id, pipeline_id: pipe.id, stage_id: firstStage.id,
    position: 0, moved_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,pipeline_id' })

  if (cardError) return failure()

  // O helper compartilhado engole erros; aqui privacidade e sucesso exigem confirmação.
  failedStep = 'whatsapp_messages.update'
  const { error: waError } = await db.from('whatsapp_messages')
    .update({ buyer_id: to_buyer_id }).eq('lead_id', lead_id).neq('buyer_id', to_buyer_id)
  if (waError) return failure()

  // 5) Debita 1 crédito de lead do novo dono (reatribuição = entrega que cobra).
  //    Admin é ISENTO (debitRow fica null pra ele) → não debita.
  if (!isAdminAgent && debitRow) {
    failedStep = 'credits.debit'
    const { error: debitError } = await db.from('credits').update({ total_used: (Number(debitRow.total_used) || 0) + 1 }).eq('id', debitRow.id)
    if (debitError) return failure()
  }

  // 5b) REFUND ao dono ANTERIOR: ele perdeu o lead → o credito dele VOLTA (espelha o
  //     debito do novo dono). Sem isso, toda reatribuicao VAZA 1 credito do perdedor
  //     (caso Fabiany: o lead saiu dela e o saldo ficou 4 em vez de 5). So pra lead
  //     AUTOMATICO (manual nao debita) + dono anterior nao-admin; nunca abaixo de 0.
  const prevOwner = lead.assigned_to
  const leadIsManual = lead.raw_data?.source === 'manual' || lead.campaign_name === 'Manual' || lead.form_name === 'manual_entry'
  if (refund_previous && prevOwner && prevOwner !== to_buyer_id && !leadIsManual) {
    const { data: prevAdmin } = await db.from('buyers').select('is_admin').eq('id', prevOwner).maybeSingle()
    if (!prevAdmin?.is_admin) {
      const { data: pc } = await db.from('credits')
        .select('id, total_used').eq('buyer_id', prevOwner).eq('type', 'lead').gt('total_used', 0)
        .eq('lead_language', language)
        .order('total_used', { ascending: false }).limit(1)
      if (pc && pc[0]) {
        failedStep = 'credits.refund'
        const { error: refundError } = await db.from('credits').update({ total_used: Math.max(0, (Number(pc[0].total_used) || 0) - 1) }).eq('id', pc[0].id)
        if (refundError) return failure()
        console.log(`[Reassign] refund 1 credito ao dono anterior ${prevOwner} (perdeu o lead ${lead_id}).`)
      }
    }
  }

  // 6) Notifica o novo agente
  if (notify_target) {
    try { await sendLeadNotificationEmail(toBuyer as Parameters<typeof sendLeadNotificationEmail>[0], lead) } catch (e) { console.error('[Reassign] notify:', e instanceof Error ? e.message : 'Falha na notificacao') }
  }

  return NextResponse.json({ success: true, to: (toBuyer.name || '').trim(), credito_debitado: !isAdminAgent, saldo_restante: isAdminAgent ? null : remaining - 1, admin_isento: isAdminAgent, refund_previous })
  } catch {
    // Timeout de transporte pode ter ocorrido após commit: não repetir às cegas.
    return failure()
  }
}
