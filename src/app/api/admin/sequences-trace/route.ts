import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'

/**
 * GET /api/admin/sequences-trace?secret=X
 *
 * Pra cada sequence_enrollment due (status=active, next_run_at <= now),
 * tenta o passo atual e captura o erro completo. NAO atualiza nada
 * (read-only debug).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const includeAll = url.searchParams.get('all') === '1'
  const leadIdFilter = url.searchParams.get('lead_id')

  let q = db
    .from('sequence_enrollments')
    .select('*, sequences(*)')
    .eq('status', 'active')
  if (!includeAll && !leadIdFilter) q = q.lte('next_run_at', now)
  if (leadIdFilter) q = q.eq('lead_id', leadIdFilter)
  const { data: due } = await q.limit(50)

  const trace: any[] = []

  for (const enr of due || []) {
    const entry: any = {
      enrollment_id: enr.id,
      sequence_id: enr.sequence_id,
      sequence_name: (enr.sequences as any)?.name,
      lead_id: enr.lead_id,
      buyer_id: enr.buyer_id,
      current_step: enr.current_step,
      next_run_at: enr.next_run_at,
    }

    try {
      const { data: steps } = await db
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', enr.sequence_id)
        .order('step_order')

      const step = steps?.[enr.current_step]
      if (!step) { entry.diagnose = 'step_not_found'; trace.push(entry); continue }

      entry.step_type = step.step_type
      entry.template_id = step.template_id

      const { data: lead } = await db.from('leads').select('*').eq('id', enr.lead_id).single()
      const { data: agent } = await db.from('buyers').select('name, email, phone, wa_bridge_url, wa_bridge_key, wa_bridge_status').eq('id', enr.buyer_id).single()

      if (!lead) { entry.diagnose = 'lead_not_found'; trace.push(entry); continue }
      if (!agent) { entry.diagnose = 'agent_not_found'; trace.push(entry); continue }

      entry.lead = { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, archived: lead.archived }
      entry.agent_bridge = {
        url: agent.wa_bridge_url,
        status: agent.wa_bridge_status,
        has_key: !!agent.wa_bridge_key,
      }

      if (step.step_type === 'wait') { entry.diagnose = 'would_skip_wait'; trace.push(entry); continue }

      if (step.step_type === 'send_template') {
        if (!step.template_id && !step.custom_body) {
          entry.diagnose = 'no_template_or_custom_body'; trace.push(entry); continue
        }
        let tpl: any = null
        if (step.template_id) {
          const { data } = await db.from('templates').select('*').eq('id', step.template_id).maybeSingle()
          tpl = data
          entry.template_found = !!tpl
          if (tpl) entry.template_type = tpl.type
        }
        const tplType = tpl?.type || 'whatsapp'

        if (tplType === 'whatsapp') {
          if (!lead.phone) { entry.diagnose = 'no_lead_phone'; trace.push(entry); continue }
          // Tenta render o body
          try {
            const body = renderTemplate(tpl?.body || step.custom_body || '', lead, agent)
            entry.body_preview = body.slice(0, 100)
          } catch (e: any) {
            entry.diagnose = 'template_render_error'
            entry.error = e?.message
            trace.push(entry); continue
          }
          // Tenta o fetch wa-bridge (HEAD pra nao gastar)
          const bridgeUrl = agent.wa_bridge_url || process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457'
          entry.would_send_to_bridge = bridgeUrl
          entry.diagnose = 'would_send_whatsapp'
        } else {
          if (!lead.email) { entry.diagnose = 'no_lead_email'; trace.push(entry); continue }
          entry.diagnose = 'would_send_email'
        }
      } else if (step.step_type === 'notify_agent') {
        if (!agent.email) { entry.diagnose = 'agent_no_email'; trace.push(entry); continue }
        entry.diagnose = 'would_notify_agent'
      }
    } catch (e: any) {
      entry.diagnose = 'exception'
      entry.error = e?.message
      entry.stack = e?.stack?.split('\n').slice(0, 3)
    }
    trace.push(entry)
  }

  return NextResponse.json({ now, due_count: due?.length || 0, trace })
}
