import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadNotificationEmail } from '@/lib/notifications'

/**
 * POST /api/admin/resend-notifications
 * Re-envia notificação WhatsApp + Email de leads já atribuídos.
 * Útil quando um lead foi assigned direto no DB mas sem disparar notificação.
 *
 * Body: { lead_ids: string[] } OR { since_hours: number } OR { names: string[] }
 */
export async function POST(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const db = createAdminClient()

  let query = db.from('leads').select('*, buyer:assigned_to(id, name, email, phone, whatsapp, notification_email, notification_sms)').not('assigned_to', 'is', null)

  if (body.lead_ids?.length) {
    query = query.in('id', body.lead_ids)
  } else if (body.names?.length) {
    query = query.in('name', body.names)
  } else if (body.since_hours) {
    const cutoff = new Date(Date.now() - body.since_hours * 3600_000).toISOString()
    query = query.gte('created_at', cutoff)
  } else {
    return NextResponse.json({ error: 'Precisa de lead_ids, names OR since_hours' }, { status: 400 })
  }

  const { data: leads, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ lead_id: string; name: string; buyer: string; status: 'sent' | 'error'; error?: string }> = []

  for (const lead of leads || []) {
    const buyer = (lead as any).buyer
    if (!buyer) {
      results.push({ lead_id: lead.id, name: lead.name, buyer: 'null', status: 'error', error: 'Buyer null' })
      continue
    }

    try {
      await sendLeadNotificationEmail(buyer, lead)
      results.push({ lead_id: lead.id, name: lead.name, buyer: buyer.name, status: 'sent' })
    } catch (err: any) {
      results.push({
        lead_id: lead.id,
        name: lead.name,
        buyer: buyer.name,
        status: 'error',
        error: err?.message?.slice(0, 200),
      })
    }
  }

  return NextResponse.json({
    total: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  })
}
