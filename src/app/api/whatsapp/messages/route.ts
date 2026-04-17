import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/whatsapp/messages?lead_id=X — thread pra lead */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const leadId = url.searchParams.get('lead_id')
  const buyerId = url.searchParams.get('buyer_id')

  if (!leadId && !buyerId) {
    return NextResponse.json({ error: 'Missing lead_id or buyer_id' }, { status: 400 })
  }

  const db = createAdminClient()
  let query = db.from('whatsapp_messages').select('*').order('sent_at', { ascending: true })
  if (leadId) query = query.eq('lead_id', leadId)
  if (buyerId && !leadId) query = query.eq('buyer_id', buyerId).is('read_at', null).eq('direction', 'in')

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messages: data || [] })
}

/** POST /api/whatsapp/messages — send + log */
export async function POST(request: NextRequest) {
  try {
    const { lead_id, buyer_id, body } = await request.json()
    if (!lead_id || !buyer_id || !body?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data: lead } = await db.from('leads').select('phone').eq('id', lead_id).single()
    if (!lead?.phone) return NextResponse.json({ error: 'Lead sem telefone' }, { status: 400 })

    const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
    const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')

    const r = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanPhone, message: body }),
    })

    if (!r.ok) return NextResponse.json({ error: 'wa-bridge falhou' }, { status: 500 })
    const { id: waId } = await r.json()

    const { data: msg } = await db.from('whatsapp_messages').insert({
      buyer_id,
      lead_id,
      direction: 'out',
      from_phone: '',
      to_phone: cleanPhone,
      body,
      wa_message_id: waId,
      status: 'sent',
    }).select().single()

    return NextResponse.json({ message: msg })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/** PATCH /api/whatsapp/messages — mark as read */
export async function PATCH(request: NextRequest) {
  const { lead_id, buyer_id } = await request.json()
  if (!lead_id && !buyer_id) return NextResponse.json({ error: 'Missing' }, { status: 400 })

  const db = createAdminClient()
  let query = db.from('whatsapp_messages').update({ read_at: new Date().toISOString() })
    .eq('direction', 'in').is('read_at', null)
  if (lead_id) query = query.eq('lead_id', lead_id)
  if (buyer_id) query = query.eq('buyer_id', buyer_id)

  await query
  return NextResponse.json({ success: true })
}
