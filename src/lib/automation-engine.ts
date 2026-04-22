import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { Resend } from 'resend'

interface Automation {
  id: string
  buyer_id: string
  name: string
  trigger_type: 'stage_entered' | 'stage_stale' | 'no_response' | 'meeting_before'
  trigger_config: { stage_id?: string; hours?: number }
  action_type: 'send_template' | 'move_stage' | 'notify_agent'
  action_config: { template_id?: string; target_stage_id?: string }
  enabled: boolean
}

/**
 * Run enabled automations for a given buyer.
 * Called by cron (every 30min) and on pipeline_lead stage changes.
 */
export async function runAutomations(buyerIds?: string[]): Promise<{ ran: number; failed: number }> {
  const db = createAdminClient()
  let query = db.from('automations').select('*').eq('enabled', true)
  if (buyerIds && buyerIds.length > 0) query = query.in('buyer_id', buyerIds)

  const { data: automations } = await query
  if (!automations || automations.length === 0) return { ran: 0, failed: 0 }

  let ran = 0, failed = 0

  for (const auto of automations as Automation[]) {
    try {
      const targets = await findTargets(auto)
      for (const target of targets) {
        // Idempotency: (automation_id, lead_id, meeting_id) — meeting_id NULL para triggers sem reunião
        let existingQuery = db
          .from('automation_runs')
          .select('id')
          .eq('automation_id', auto.id)
          .eq('lead_id', target.lead_id)
        existingQuery = target.meeting_id
          ? existingQuery.eq('meeting_id', target.meeting_id)
          : existingQuery.is('meeting_id', null)
        const { data: existing } = await existingQuery.maybeSingle()
        if (existing) continue

        try {
          await executeAction(auto, target)
          await db.from('automation_runs').insert({
            automation_id: auto.id,
            lead_id: target.lead_id,
            pipeline_lead_id: target.pipeline_lead_id || null,
            meeting_id: target.meeting_id || null,
            meeting_source: target.meeting_source || null,
            status: 'success',
          })
          ran++
        } catch (err: any) {
          await db.from('automation_runs').insert({
            automation_id: auto.id,
            lead_id: target.lead_id,
            pipeline_lead_id: target.pipeline_lead_id || null,
            meeting_id: target.meeting_id || null,
            meeting_source: target.meeting_source || null,
            status: 'failed',
            error: err?.message?.slice(0, 500) || 'Unknown error',
          })
          failed++
        }
      }
    } catch (err) {
      console.error(`[Automation ${auto.id}] Engine error:`, err)
    }
  }

  return { ran, failed }
}

interface Target {
  lead_id: string
  pipeline_lead_id?: string | null
  meeting_id?: string | null
  meeting_source?: 'appointment' | 'calendar_item' | null
}

async function findTargets(auto: Automation): Promise<Target[]> {
  const db = createAdminClient()

  if (auto.trigger_type === 'stage_entered') {
    const stageId = auto.trigger_config.stage_id
    if (!stageId) return []
    // Leads currently in that stage, buyer owns them
    const { data } = await db
      .from('pipeline_leads')
      .select('id, lead_id, buyer_id')
      .eq('stage_id', stageId)
      .eq('buyer_id', auto.buyer_id)
    return (data || []).map(r => ({ lead_id: r.lead_id, pipeline_lead_id: r.id }))
  }

  if (auto.trigger_type === 'stage_stale') {
    const stageId = auto.trigger_config.stage_id
    const hours = auto.trigger_config.hours || 24
    if (!stageId) return []
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const { data } = await db
      .from('pipeline_leads')
      .select('id, lead_id, buyer_id')
      .eq('stage_id', stageId)
      .eq('buyer_id', auto.buyer_id)
      .lte('moved_at', cutoff)
    return (data || []).map(r => ({ lead_id: r.lead_id, pipeline_lead_id: r.id }))
  }

  if (auto.trigger_type === 'no_response') {
    const hours = auto.trigger_config.hours || 48
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    // Leads assigned to this buyer with no incoming activity since cutoff
    const { data: leads } = await db
      .from('leads')
      .select('id')
      .eq('assigned_to', auto.buyer_id)
      .lte('created_at', cutoff)
    return (leads || []).map(r => ({ lead_id: r.id }))
  }

  if (auto.trigger_type === 'meeting_before') {
    // Dispara quando uma reunião está a ~hours horas de acontecer.
    // Cron roda a cada 30min → janela de 35min antes do alvo + 5min de folga.
    const hours = auto.trigger_config.hours || 1
    const targetMs = Date.now() + hours * 60 * 60 * 1000
    const lower = new Date(targetMs - 35 * 60 * 1000).toISOString()
    const upper = new Date(targetMs + 5 * 60 * 1000).toISOString()

    const [apptRes, itemRes] = await Promise.all([
      db.from('appointments')
        .select('id, lead_id')
        .eq('buyer_id', auto.buyer_id)
        .gte('scheduled_at', lower)
        .lte('scheduled_at', upper)
        .in('status', ['scheduled', 'confirmed']),
      db.from('calendar_items')
        .select('id, lead_id')
        .eq('buyer_id', auto.buyer_id)
        .eq('kind', 'event')
        .not('lead_id', 'is', null)
        .gte('start_at', lower)
        .lte('start_at', upper)
        .is('completed_at', null),
    ])

    const targets: Target[] = []
    for (const a of apptRes.data || []) {
      if (a.lead_id) targets.push({ lead_id: a.lead_id, meeting_id: a.id, meeting_source: 'appointment' })
    }
    for (const c of itemRes.data || []) {
      if (c.lead_id) targets.push({ lead_id: c.lead_id, meeting_id: c.id, meeting_source: 'calendar_item' })
    }
    return targets
  }

  return []
}

async function executeAction(auto: Automation, target: Target): Promise<void> {
  const db = createAdminClient()

  if (auto.action_type === 'send_template') {
    const templateId = auto.action_config.template_id
    if (!templateId) throw new Error('Missing template_id')

    const [{ data: template }, { data: lead }, { data: agent }] = await Promise.all([
      db.from('templates').select('*').eq('id', templateId).single(),
      db.from('leads').select('*').eq('id', target.lead_id).single(),
      db.from('buyers').select('name, email, phone').eq('id', auto.buyer_id).single(),
    ])

    if (!template || !lead || !agent) throw new Error('Template/lead/agent not found')

    const body = renderTemplate(template.body, lead, agent)

    if (template.type === 'whatsapp') {
      if (!lead.phone) throw new Error('Lead sem telefone')
      const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
      const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
      const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
      const res = await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone, message: body }),
      })
      if (!res.ok) throw new Error(`wa-bridge ${res.status}`)
      const { id: waId } = await res.json().catch(() => ({ id: null }))

      // Salva na thread de conversa
      await db.from('whatsapp_messages').insert({
        buyer_id: auto.buyer_id,
        lead_id: target.lead_id,
        direction: 'out',
        from_phone: '',
        to_phone: cleanPhone,
        body,
        wa_message_id: waId,
        status: 'sent',
      })
    } else {
      if (!lead.email) throw new Error('Lead sem email')
      const resendKey = (process.env.RESEND_API_KEY || '').trim()
      if (!resendKey) throw new Error('Resend not configured')
      const resend = new Resend(resendKey)
      const subject = template.subject ? renderTemplate(template.subject, lead, agent) : `Mensagem de ${agent.name}`
      await resend.emails.send({
        from: `${agent.name} <onboarding@resend.dev>`,
        to: lead.email,
        subject,
        html: body.replace(/\n/g, '<br/>'),
      })
    }

    await db.from('follow_ups').insert({
      lead_id: target.lead_id,
      buyer_id: auto.buyer_id,
      type: template.type,
      description: `[Automação] ${auto.name} → ${template.name}`,
      completed_at: new Date().toISOString(),
    })
    return
  }

  if (auto.action_type === 'move_stage') {
    const targetStageId = auto.action_config.target_stage_id
    if (!targetStageId || !target.pipeline_lead_id) throw new Error('Missing stage or pipeline_lead')
    await db.from('pipeline_leads').update({
      stage_id: targetStageId,
      moved_at: new Date().toISOString(),
    }).eq('id', target.pipeline_lead_id)
    return
  }

  if (auto.action_type === 'notify_agent') {
    const { data: lead } = await db.from('leads').select('name, phone, email').eq('id', target.lead_id).single()
    const { data: agent } = await db.from('buyers').select('email, notification_email').eq('id', auto.buyer_id).single()
    if (!agent?.notification_email || !agent.email) return

    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) return
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'Lead4Producers <noreply@resend.dev>',
      to: agent.email,
      subject: `⏰ Automação: ${auto.name}`,
      html: `<p>Sua automação <b>${auto.name}</b> detectou o lead <b>${lead?.name || target.lead_id}</b> (${lead?.phone || lead?.email || 'sem contato'}).</p><p><a href="https://lead4producers.com/dashboard/pipeline">Abrir pipeline →</a></p>`,
    })
    return
  }

  throw new Error(`Unknown action: ${auto.action_type}`)
}
