import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/webhook/wa-bridge
 * Receives inbound WhatsApp messages from wa-bridge on VPS.
 * Matches them to leads by phone and saves to whatsapp_messages table.
 */
export async function POST(request: NextRequest) {
  try {
    const apikey = request.headers.get('apikey')
    const expected = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    if (apikey !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { wa_message_id, from, to, body, type, has_media, media_url, media_type, media_mimetype } = await request.json()
    if (!wa_message_id || !from) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()

    // Dedupe
    const { data: existing } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('wa_message_id', wa_message_id)
      .maybeSingle()
    if (existing) return NextResponse.json({ skipped: 'duplicate' })

    // Normalize phone: wa-bridge sends "14078796419" (no + no spaces)
    const normalizedFrom = from.replace(/\D/g, '')

    // Find the buyer whose WhatsApp number received this (reverse lookup: to === buyer's bridge number)
    // In SaaS mode (future), each buyer has own bridge. For now, we look for any lead with this phone.
    // Phone matching: try exact, then last-10 digits, then last-11
    const last10 = normalizedFrom.slice(-10)
    const last11 = normalizedFrom.slice(-11)

    const { data: candidates } = await db
      .from('leads')
      .select('id, assigned_to, phone, name')
      .or(`phone.ilike.%${last10},phone.ilike.%${last11},phone.eq.${normalizedFrom},phone.eq.+${normalizedFrom}`)
      .limit(10)

    // Pick most recent or assigned lead
    const match = (candidates || []).find(c => c.assigned_to) || (candidates || [])[0]

    if (!match || !match.assigned_to) {
      // No matching lead — store as unassigned (skip for now, log)
      console.log(`[WA Inbox] No matching lead for phone ${normalizedFrom}`)
      return NextResponse.json({ skipped: 'no_lead' })
    }

    await db.from('whatsapp_messages').insert({
      buyer_id: match.assigned_to,
      lead_id: match.id,
      direction: 'in',
      from_phone: normalizedFrom,
      to_phone: to || '',
      body: body || '',
      media_type: media_type || (has_media ? (type || 'media') : null),
      media_url: media_url || null,
      wa_message_id,
      status: 'delivered',
    })

    // Bump lead updated_at
    await db.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', match.id)

    // Push notification pro agente
    try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      const preview = body
        ? body.slice(0, 80)
        : media_type === 'audio' ? '🎤 Mensagem de voz'
        : media_type === 'image' ? '📷 Enviou uma imagem'
        : media_type === 'video' ? '🎥 Enviou um vídeo'
        : media_type ? '📎 Enviou um arquivo' : 'Nova mensagem'
      pushToBuyer(match.assigned_to, {
        title: `💬 ${match.name || 'Lead'}`,
        body: preview,
        url: `/dashboard/whatsapp?lead=${match.id}`,
        tag: `msg-${match.id}`,
      }).catch(err => console.error('[Push msg] err', err))
    } catch (e) {}

    return NextResponse.json({ success: true, lead_id: match.id })
  } catch (err: any) {
    console.error('[WA Webhook] Error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
