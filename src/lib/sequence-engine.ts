import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { getBridgeForBuyer } from '@/lib/wa-bridge'
import { SequenceWaiting, SequenceRejectedSettled, sendSequenceMessage, verifiedSequenceBridge } from './sequence-batch'
import { checkSendRate } from '@/lib/send-guard'
import { Resend } from 'resend'
import { localeDoBuyer, trad } from '@/lib/buyer-locale'
import { localizeLeadTemplate } from '@/lib/lead-message-template'
import { requireLeadMessageLocale } from '@/lib/lead-message-locale'

/**
 * Enrolla o lead em todas as sequences ativas cujo trigger_stage_id bate com o stage
 * que ele acabou de entrar.
 *
 * IMPORTANTE: tabela tem UNIQUE (sequence_id, lead_id). Se o lead ja foi enrolled
 * nessa sequence antes (mesmo que status 'stopped' ou 'completed'), INSERT falha.
 * Nesse caso, REATIVAMOS o enrollment existente (current_step=0, status=active,
 * next_run_at=agora+delay). Isso garante que quando o user tira um lead da coluna
 * e bota de volta, a sequence re-dispara do zero.
 */
export async function autoEnrollByStage(
  leadId: string,
  stageId: string,
  buyerId: string,
): Promise<number> {
  const db = createAdminClient()
  const { data: matches } = await db
    .from('sequences')
    .select('id, mode, ai_config')
    .eq('buyer_id', buyerId)
    .eq('enabled', true)
    .eq('trigger_stage_id', stageId)
  if (!matches || matches.length === 0) return 0

  let enrolled = 0
  for (const s of matches) {
    if (s.mode === 'ai_until_reply') {
      try {
        const { nextSendAt, validateAIConfig } = await import('@/lib/ai-sequence-config')
        const c = validateAIConfig(s.ai_config)
        const due = nextSendAt(new Date(Date.now() + c.initial_delay_minutes * 60000), c)
        const { error } = await db.rpc('enroll_sequence', { p_buyer: buyerId, p_sequence: s.id, p_lead: leadId, p_due: due.toISOString() })
        if (!error) enrolled++
      } catch { console.warn('[sequence] AI enrollment withheld: invalid configuration') }
      continue // Never reactivate stopped/replied AI enrollments.
    }
    const { data: firstStep } = await db
      .from('sequence_steps')
      .select('delay_hours')
      .eq('sequence_id', s.id)
      .order('step_order')
      .limit(1)
      .maybeSingle()
    const nowMs = Date.now()
    const nextAt = new Date(nowMs + ((firstStep?.delay_hours || 0) * 3600_000)).toISOString()

    // Checa se ja existe enrollment pra esse (sequence, lead)
    const { data: existing } = await db
      .from('sequence_enrollments')
      .select('id, status')
      .eq('sequence_id', s.id)
      .eq('lead_id', leadId)
      .maybeSingle()

    if (existing) {
      // Reativa (independente de status anterior — active/completed/stopped/paused)
      const { error: updErr } = await db
        .from('sequence_enrollments')
        .update({
          current_step: 0,
          status: 'active',
          next_run_at: nextAt,
          enrolled_at: new Date(nowMs).toISOString(),
          completed_at: null,
        })
        .eq('id', existing.id)
      if (updErr) console.error('[autoEnroll] reactivate err:', updErr.message)
      else enrolled++
    } else {
      const { error } = await db.from('sequence_enrollments').insert({
        sequence_id: s.id, lead_id: leadId, buyer_id: buyerId,
        current_step: 0, next_run_at: nextAt, status: 'active',
      })
      if (!error || error.code === '23505') enrolled++
      else console.error('[autoEnroll] insert err:', error.message)
    }
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
    .order('next_run_at').order('id')
    .limit(50)

  if (!due || due.length === 0) return 0

  let processed = 0
  for (const enr of due) {
    if (enr.mode === 'ai_until_reply') {
      try {
        const { runAIEnrollment, aiEnginePorts } = await import('@/lib/ai-sequence-engine')
        if (await runAIEnrollment(enr.id, aiEnginePorts(db))) processed++
      }
      catch { console.warn('[sequence] AI processing withheld: storage unavailable') }
      continue
    }
    try { if (await runLegacyEnrollment(enr.id, db)) processed++ }
    catch { console.warn('[sequence] Legacy execution withheld') }
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
    .select('id, mode, ai_config')
    .eq('buyer_id', buyerId)
    .eq('trigger_stage_id', fromStageId)
  if (!seqs || seqs.length === 0) return 0
  const ids = seqs.filter(s => s.mode !== 'ai_until_reply' || s.ai_config?.stop_on_stage_exit === true).map(s => s.id)
  if (!ids.length) return 0

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
 * Scheduled AI and legacy runs are disjoint; direct callers may process both.
 */
export async function processSequences(options: { mode?: 'legacy' | 'ai_until_reply' } = {}): Promise<{ processed: number; failed: number }> {
  const db = createAdminClient()
  // Both modes share the minute cron's durable reply outbox, even with no due sends.
  // Lost/aborted responses are safe: SQL either commits an audited result or retains intent.
  try {
    const { error } = await db.rpc('drain_sequence_reply_moves', { p_limit: 25 }).abortSignal(AbortSignal.timeout(5000))
    if (error) console.warn('[sequence] Reply movement retry pending')
  } catch { console.warn('[sequence] Reply movement retry pending') }
  const now = new Date().toISOString()

  let query = db
    .from('sequence_enrollments')
    .select('*, sequences(*)')
    .eq('status', 'active')
    .lte('next_run_at', now)
  // Filter in SQL BEFORE the limit so a backlog of the other mode cannot starve this run.
  if (options.mode) query = query.eq('mode', options.mode)
  const { data: due } = await query.order('next_run_at').order('id').limit(200)

  if (!due || due.length === 0) return { processed: 0, failed: 0 }

  let processed = 0, failed = 0

  for (const enr of due) {
    if (enr.mode === 'ai_until_reply') {
      try {
        const { runAIEnrollment, aiEnginePorts } = await import('@/lib/ai-sequence-engine')
        if (await runAIEnrollment(enr.id, aiEnginePorts(db))) processed++
      }
      catch { console.warn('[sequence] AI processing withheld: storage unavailable') }
      continue
    }
    try { if (await runLegacyEnrollment(enr.id, db)) processed++ }
    catch { failed++ }
  }

  return { processed, failed }
}

type LegacyEnrollment = { id:string; buyer_id:string; lead_id:string; sequence_id:string; current_step:number; lease_token:string; enrolled_at?:string }
type Receipt = {id:string;from:string;to:string}
type Db = ReturnType<typeof createAdminClient>
async function sequenceRpc(db:Db,name:string,args:Record<string,unknown>) {
  const {data,error}=await db.rpc(name,args)
  if(error)throw new Error('Sequence storage unavailable')
  return data
}
/** Shared by cron, inline and administrative execution. Never advances on waiting. */
export async function runLegacyEnrollment(id:string,db:Db=createAdminClient()):Promise<boolean> {
  const e:LegacyEnrollment|undefined=(await sequenceRpc(db,'claim_legacy_sequence',{p_id:id}))?.[0]
  if(!e)return false
  let sending=false
  try {
    const {data:steps,error}=await db.from('sequence_steps').select('*').eq('sequence_id',e.sequence_id).order('step_order')
    if(error)throw new Error('Steps unavailable')
    const begin=async(sender:string|null,body:string)=>{
      const result=await sequenceRpc(db,'begin_sequence_batch',{p_id:id,p_token:e.lease_token,p_sender:sender,p_body:body})
      if(!result?.allowed)throw new SequenceWaiting()
      sending=true
    }
    const step=steps?.[e.current_step]
    const receipt=step ? await executeStep(step,e,begin,db) : (await begin(null,''),null)
    if(!await sequenceRpc(db,'finish_sequence_batch',{p_id:id,p_token:e.lease_token,p_wa:receipt?.id||'',p_choice:'',p_next:new Date().toISOString(),p_from:receipt?.from||'',p_to:receipt?.to||''}))throw new Error('Confirmation not persisted')
    return true
  }catch(error){
    if(error instanceof SequenceRejectedSettled)return false
    const waiting=!sending && error instanceof SequenceWaiting
    await sequenceRpc(db,waiting?'wait_sequence_batch':'defer_sequence_batch',{
      p_id:id,p_token:e.lease_token,p_reason:sending?'delivery_unknown':waiting?'batch_wait':'execution_failed',
      p_next:new Date(Date.now()+300000).toISOString(),...(waiting?{}:{p_unknown:sending}),
    })
    if(!waiting)throw error
    return false
  }
}
async function executeStep(step: { step_type: string; template_id?: string | null; custom_body?: string | null; step_order: number }, enr: LegacyEnrollment, begin:(sender:string|null,body:string)=>Promise<void>,db:Db): Promise<Receipt|null> {

  if (step.step_type === 'wait') { await begin(null,''); return null }

  if (step.step_type === 'notify_agent') {
    const { data: agent } = await db.from('buyers').select('email, name').eq('id', enr.buyer_id).single()
    const { data: lead } = await db.from('leads').select('name, phone, email').eq('id', enr.lead_id).single()
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!agent?.email || !resendKey) throw new Error('Notification unavailable')
    await begin(null,'')
    const resend = new Resend(resendKey)
    const loc = await localeDoBuyer(db, enr.buyer_id)
    const T = trad(loc)
    await resend.emails.send({
      from: 'Lead4Producers <noreply@resend.dev>',
      to: agent.email,
      subject: `🔔 ${T('Sequência lembrou', 'Sequence reminder', 'Recordatorio de secuencia')}: ${lead?.name || enr.lead_id}`,
      html: T(
        `<p>Hora de ligar para <b>${lead?.name}</b> (${lead?.phone || lead?.email}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir pipeline →</a></p>`,
        `<p>Time to call <b>${lead?.name}</b> (${lead?.phone || lead?.email}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Open pipeline →</a></p>`,
        `<p>Es hora de llamar a <b>${lead?.name}</b> (${lead?.phone || lead?.email}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir flujo de ventas →</a></p>`,
      ),
    })
    return null
  }

  // send_template
  const { data: lead } = await db.from('leads').select('*').eq('id', enr.lead_id).single()
  const { data: agent } = await db.from('buyers').select('name, email, phone, is_active').eq('id', enr.buyer_id).single()
  if (!lead || !agent) throw new Error('Lead or agent missing')
  const loc = requireLeadMessageLocale(lead)
  // Comprador suspenso: não dispara mensagem (sequência fica parada até reativar)
  if (agent.is_active === false) throw new SequenceWaiting()

  let body = ''
  let type: 'whatsapp' | 'email' = 'whatsapp'
  let subject: string | null = null

  if (step.template_id) {
    const { data: tpl } = await db.from('templates').select('*').eq('id', step.template_id).single()
    if (!tpl) throw new Error('Template not found')
    const localizedTemplate = await localizeLeadTemplate(db, tpl, lead)
    body = renderTemplate(localizedTemplate.body, lead, agent, loc)
    type = localizedTemplate.type
    subject = localizedTemplate.subject ? renderTemplate(localizedTemplate.subject, lead, agent, loc) : null
  } else if (step.custom_body) {
    const copy = await localizeLeadTemplate(db, { name: '', body: step.custom_body }, lead)
    body = renderTemplate(copy.body, lead, agent, loc)
  } else {
    throw new Error('Step has no template or custom_body')
  }

  let receipt:Receipt|null=null
  if (type === 'whatsapp') {
    if (!lead.phone) throw new Error('No phone')
    // Envia pela bridge do DONO do lead (não pela global/Regiane)
    // 🛑 LIMITADOR por conta — sequência também respeita o teto (2026-07-31)
    const rate = await checkSendRate(db, enr.buyer_id)
    if (!rate.ok) throw new SequenceWaiting()
    const sb = await verifiedSequenceBridge(await getBridgeForBuyer(db, enr.buyer_id))
    if(sb.ownerBuyerId!==enr.buyer_id)throw new SequenceWaiting()
    await begin(sb.phone,body)
    const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
    const waId=await sendSequenceMessage(sb,enr,cleanPhone,body,(name,args)=>sequenceRpc(db,name,args),15000)
    receipt={id:waId,from:sb.phone,to:cleanPhone}
  } else {
    if (!lead.email) throw new Error('No email')
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) throw new Error('Resend not configured')
    const resend = new Resend(resendKey)
    await begin(null,body)
    const result=await resend.emails.send({
      from: `${agent.name} <onboarding@resend.dev>`,
      to: lead.email,
      subject: subject || (loc === 'en'
        ? `Message from ${agent.name}`
        : loc === 'es' ? `Mensaje de ${agent.name}` : `Mensagem de ${agent.name}`),
      html: body.replace(/\n/g, '<br/>'),
    })
    if(result.error)throw new Error('Email not confirmed')
  }

  await db.from('follow_ups').insert({
    lead_id: enr.lead_id,
    buyer_id: enr.buyer_id,
    type,
    description: `${loc === 'pt' ? '[Sequência] passo' : loc === 'es' ? '[Secuencia] paso' : '[Sequence] step'} ${step.step_order + 1}`,
    completed_at: new Date().toISOString(),
  })
  return receipt
}
