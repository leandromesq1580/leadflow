import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'

/**
 * POST /api/admin/force-sequence-step?secret=X&enrollment_id=Y
 *
 * Executa o step atual de 1 enrollment, capturando QUALQUER erro com stack.
 * Atualiza next_run_at apenas se sucesso. Pra debug exato de qual falha
 * esta acontecendo (dry-run nao captura erros de wa-bridge ou Resend).
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const enrollmentId = url.searchParams.get('enrollment_id')
  if (!enrollmentId) return NextResponse.json({ error: 'Missing enrollment_id' }, { status: 400 })

  const db = createAdminClient()

  try {
    const { data: enr } = await db
      .from('sequence_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .single()
    if (!enr) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })

    const { data: steps } = await db
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', enr.sequence_id)
      .order('step_order')
    const step = steps?.[enr.current_step]
    if (!step) return NextResponse.json({ error: 'No step at current_step', current_step: enr.current_step, total_steps: steps?.length })

    const { data: lead } = await db.from('leads').select('*').eq('id', enr.lead_id).single()
    const { data: agent } = await db.from('buyers').select('*').eq('id', enr.buyer_id).single()
    if (!lead) return NextResponse.json({ error: 'Lead not found' })
    if (!agent) return NextResponse.json({ error: 'Agent not found' })

    if (step.step_type === 'wait') {
      return NextResponse.json({ result: 'wait_step_skipped' })
    }

    // send_template
    let body = ''
    let type: 'whatsapp' | 'email' = 'whatsapp'
    let subject: string | null = null
    if (step.template_id) {
      const { data: tpl } = await db.from('templates').select('*').eq('id', step.template_id).single()
      if (!tpl) return NextResponse.json({ error: 'Template not found', template_id: step.template_id })
      body = renderTemplate(tpl.body, lead, agent)
      type = tpl.type
      subject = tpl.subject ? renderTemplate(tpl.subject, lead, agent) : null
    } else if (step.custom_body) {
      body = renderTemplate(step.custom_body, lead, agent)
    }

    if (type === 'whatsapp') {
      const bridgeUrl = (agent.wa_bridge_url || process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
      const bridgeKey = (agent.wa_bridge_key || process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
      const cleanPhone = String(lead.phone || '').replace(/[\s\-()]/g, '').replace(/^\+/, '')

      const r = await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone, message: body }),
      })

      const respText = await r.text()
      let respJson: any = null
      try { respJson = JSON.parse(respText) } catch {}

      return NextResponse.json({
        wa_bridge_request: { url: `${bridgeUrl}/send`, phone: cleanPhone, body_preview: body.slice(0, 100) },
        wa_bridge_response: { status: r.status, ok: r.ok, body: respJson || respText.slice(0, 500) },
      })
    }

    return NextResponse.json({ note: 'email path — not executed' })
  } catch (e: any) {
    return NextResponse.json({
      exception: e?.message,
      stack: e?.stack?.split('\n').slice(0, 5),
    }, { status: 500 })
  }
}
