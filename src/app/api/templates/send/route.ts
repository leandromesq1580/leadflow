import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { Resend } from 'resend'

/** POST /api/templates/send — render template and send via WhatsApp or Email */
export async function POST(request: NextRequest) {
  const { template_id, lead_id, buyer_id, override_body } = await request.json()
  if ((!template_id && !override_body) || !lead_id || !buyer_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createAdminClient()

  const [templateRes, leadRes, buyerRes] = await Promise.all([
    template_id ? db.from('templates').select('*').eq('id', template_id).single() : Promise.resolve({ data: null }),
    db.from('leads').select('*').eq('id', lead_id).single(),
    db.from('buyers').select('name, email, phone').eq('id', buyer_id).single(),
  ])

  const template = templateRes.data
  const lead = leadRes.data
  const agent = buyerRes.data

  if (!lead || !agent) return NextResponse.json({ error: 'Lead or buyer not found' }, { status: 404 })

  const type = template?.type || 'whatsapp'
  const body = override_body || renderTemplate(template.body, lead, agent)
  const subject = template?.subject ? renderTemplate(template.subject, lead, agent) : null

  if (type === 'whatsapp') {
    if (!lead.phone) return NextResponse.json({ error: 'Lead sem telefone' }, { status: 400 })
    const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
    const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    const cleanPhone = lead.phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')

    const res = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanPhone, message: body }),
    })

    if (!res.ok) return NextResponse.json({ error: 'Falha ao enviar WhatsApp' }, { status: 500 })
  } else if (type === 'email') {
    if (!lead.email) return NextResponse.json({ error: 'Lead sem email' }, { status: 400 })
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) return NextResponse.json({ error: 'Resend not configured' }, { status: 500 })

    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: `${agent.name} <onboarding@resend.dev>`,
      to: lead.email,
      subject: subject || `Mensagem de ${agent.name}`,
      html: body.replace(/\n/g, '<br/>'),
    })
  }

  // Log activity
  await db.from('follow_ups').insert({
    lead_id, buyer_id,
    type: type === 'whatsapp' ? 'whatsapp' : 'email',
    description: template?.name ? `Template: ${template.name}` : 'Mensagem customizada',
    completed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, sent_body: body })
}
