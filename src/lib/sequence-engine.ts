import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { Resend } from 'resend'

/**
 * Enrolla o lead em todas as sequences ativas cujo trigger_stage_id bate com o stage
 * que ele acabou de entrar. Idempotente (unique constraint sequence+lead).
 */
export async function autoEnrollByStage(
  leadId: string,
  stageId: string,
  buyerId: string,
): Promise<number> {
  const db = createAdminClient()
  const { data: matches } = await db
    .from('sequences')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('enabled', true)
    .eq('trigger_stage_id', stageId)
  if (!matches || matches.length === 0) return 0

  let enrolled = 0
  for (const s of matches) {
    const { data: firstStep } = await db
      .from('sequence_steps')
      .select('delay_hours')
      .eq('sequence_id', s.id)
      .order('step_order')
      .limit(1)
      .maybeSingle()
    const nextAt = new Date(Date.now() + ((firstStep?.delay_hours || 0) * 3600_000)).toISOString()
    const { error } = await db.from('sequence_enrollments').insert({
      sequence_id: s.id, lead_id: leadId, buyer_id: buyerId,
      current_step: 0, next_run_at: nextAt, status: 'active',
    })
    if (!error || (error as any).code === '23505') enrolled++
    else console.error('[autoEnroll] insert err:', error.message)
  }
  return enrolled
}

/**
 * Processa enrollments due de um lead especifico (usado inline apos um
 * autoEnroll pra disparar imediatamente steps com delay=0, sem esperar
 * o cron de 5min). Equivalente a processSequences() mas escopado ao lead.
 */
export async function processSequencesForLead(leadId: string): Promise<number> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: due } = await db
    .from('sequence_enrollments')
    .select('*, sequences(*)')
    .eq('status', 'active')
    .eq('lead_id', leadId)
    .lte('next_run_at', now)
    .limit(50)

  if (!due || due.length === 0) return 0

  let processed = 0
  for (const enr of due) {
    try {
      const { data: steps } = await db
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', enr.sequence_id)
        .order('step_order')
      if (!steps || steps.length === 0) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
        continue
      }
      const step = steps[enr.current_step]
      if (!step) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
        continue
      }
      await executeStep(step, enr)
      const nextIdx = enr.current_step + 1
      if (nextIdx >= steps.length) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
      } else {
        const nextStep = steps[nextIdx]
        const prevScheduled = new Date(enr.next_run_at).getTime()
        const nextAt = new Date(prevScheduled + nextStep.delay_hours * 3600_000).toISOString()
        await db.from('sequence_enrollments').update({ current_step: nextIdx, next_run_at: nextAt }).eq('id', enr.id)
      }
      processed++
    } catch (err: any) {
      console.error(`[processSequencesForLead ${enr.id}] err:`, err?.message)
      const retry = new Date(Date.now() + 3600_000).toISOString()
      await db.from('sequence_enrollments').update({ next_run_at: retry }).eq('id', enr.id)
    }
  }
  return processed
}

/**
 * Cancela enrollments ativos de um lead em sequences cujo trigger_stage_id
 * era o stage do qual o lead acabou de sair. Usa status 'stopped'.
 *
 * Cenario: lead estava em "Nao Atendeu" com sequence ativa. Agente atende
 * e move pra "Em Atendimento" → a sequence de "Nao Atendeu" deve parar
 * (nao faz sentido continuar cobrando "te liguei e nao atendeu").
 */
export async function cancelEnrollmentsForStage(
  leadId: string,
  fromStageId: string,
  buyerId: string,
): Promise<number> {
  const db = createAdminClient()
  const { data: seqs } = await db
    .from('sequences')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('trigger_stage_id', fromStageId)
  if (!seqs || seqs.length === 0) return 0
  const ids = seqs.map(s => s.id)

  const { data: updated, error } = await db
    .from('sequence_enrollments')
    .update({ status: 'stopped' })
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .in('sequence_id', ids)
    .select('id')

  if (error) {
    console.error('[cancelEnrollmentsForStage] err:', error.message)
    return 0
  }
  return updated?.length || 0
}

/**
 * Process all due sequence enrollments.
 * Runs every 30min via cron (or on enrollment).
 */
export async function processSequences(): Promise<{ processed: number; failed: number }> {
  const db = createAdminClient()
  const now = new Date().toISOString()

  const { data: due } = await db
    .from('sequence_enrollments')
    .select('*, sequences(*)')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .limit(200)

  if (!due || due.length === 0) return { processed: 0, failed: 0 }

  let processed = 0, failed = 0

  for (const enr of due) {
    try {
      // Get step at current_step index
      const { data: steps } = await db
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', enr.sequence_id)
        .order('step_order')

      if (!steps || steps.length === 0) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
        continue
      }

      const step = steps[enr.current_step]
      if (!step) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
        continue
      }

      await executeStep(step, enr)

      // Move to next step.
      // IMPORTANTE: `nextAt` e calculado a partir do `enr.next_run_at` ANTERIOR
      // (horario que ESTE step estava agendado), NAO de Date.now(). Assim cada
      // lead mantem sua propria linha do tempo baseada em quando entrou no stage,
      // mesmo que o cron processe varios leads no mesmo run. Antes usava
      // Date.now() e sincronizava todos os leads no mesmo horario.
      const nextIdx = enr.current_step + 1
      if (nextIdx >= steps.length) {
        await db.from('sequence_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enr.id)
      } else {
        const nextStep = steps[nextIdx]
        const prevScheduled = new Date(enr.next_run_at).getTime()
        const nextAt = new Date(prevScheduled + nextStep.delay_hours * 3600_000).toISOString()
        await db.from('sequence_enrollments').update({ current_step: nextIdx, next_run_at: nextAt }).eq('id', enr.id)
      }
      processed++
    } catch (err: any) {
      console.error(`[Sequence ${enr.id}] Error:`, err?.message)
      // Pause on error, retry in 1h
      const retry = new Date(Date.now() + 3600_000).toISOString()
      await db.from('sequence_enrollments').update({ next_run_at: retry }).eq('id', enr.id)
      failed++
    }
  }

  return { processed, failed }
}

async function executeStep(step: any, enr: any): Promise<void> {
  const db = createAdminClient()

  if (step.step_type === 'wait') return

  if (step.step_type === 'notify_agent') {
    const { data: agent } = await db.from('buyers').select('email, name').eq('id', enr.buyer_id).single()
    const { data: lead } = await db.from('leads').select('name, phone, email').eq('id', enr.lead_id).single()
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!agent?.email || !resendKey) return
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'Lead4Producers <noreply@resend.dev>',
      to: agent.email,
      subject: `🔔 Sequence lembrou: ${lead?.name || enr.lead_id}`,
      html: `<p>Hora de ligar pra <b>${lead?.name}</b> (${lead?.phone || lead?.email}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir pipeline →</a></p>`,
    })
    return
  }

  // send_template
  const { data: lead } = await db.from('leads').select('*').eq('id', enr.lead_id).single()
  const { data: agent } = await db.from('buyers').select('name, email, phone').eq('id', enr.buyer_id).single()
  if (!lead || !agent) throw new Error('Lead or agent missing')

  let body = ''
  let type: 'whatsapp' | 'email' = 'whatsapp'
  let subject: string | null = null

  if (step.template_id) {
    const { data: tpl } = await db.from('templates').select('*').eq('id', step.template_id).single()
    if (!tpl) throw new Error('Template not found')
    body = renderTemplate(tpl.body, lead, agent)
    type = tpl.type
    subject = tpl.subject ? renderTemplate(tpl.subject, lead, agent) : null
  } else if (step.custom_body) {
    body = renderTemplate(step.custom_body, lead, agent)
  } else {
    throw new Error('Step has no template or custom_body')
  }

  if (type === 'whatsapp') {
    if (!lead.phone) throw new Error('No phone')
    const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
    const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
    const r = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanPhone, message: body }),
    })
    if (!r.ok) throw new Error(`wa-bridge ${r.status}`)
    const { id: waId } = await r.json()
    await db.from('whatsapp_messages').insert({
      buyer_id: enr.buyer_id,
      lead_id: enr.lead_id,
      direction: 'out',
      from_phone: '',
      to_phone: cleanPhone,
      body,
      wa_message_id: waId,
      status: 'sent',
    })
  } else {
    if (!lead.email) throw new Error('No email')
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) throw new Error('Resend not configured')
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: `${agent.name} <onboarding@resend.dev>`,
      to: lead.email,
      subject: subject || `Mensagem de ${agent.name}`,
      html: body.replace(/\n/g, '<br/>'),
    })
  }

  await db.from('follow_ups').insert({
    lead_id: enr.lead_id,
    buyer_id: enr.buyer_id,
    type,
    description: `[Sequence] passo ${step.step_order + 1}`,
    completed_at: new Date().toISOString(),
  })
}
