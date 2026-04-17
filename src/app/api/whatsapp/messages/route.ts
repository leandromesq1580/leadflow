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

function classifyMedia(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

/** POST /api/whatsapp/messages — envia texto OU mídia */
export async function POST(request: NextRequest) {
  try {
    const db = createAdminClient()
    const contentType = request.headers.get('content-type') || ''

    let lead_id: string, buyer_id: string, body: string
    let fileBuffer: ArrayBuffer | null = null
    let fileName = ''
    let fileMimetype = ''

    if (contentType.includes('multipart/form-data')) {
      // Upload com arquivo
      const form = await request.formData()
      lead_id = String(form.get('lead_id') || '')
      buyer_id = String(form.get('buyer_id') || '')
      body = String(form.get('body') || '')
      const file = form.get('file') as File | null
      if (file) {
        fileBuffer = await file.arrayBuffer()
        fileName = file.name || 'file'
        fileMimetype = file.type || 'application/octet-stream'
      }
    } else {
      const json = await request.json()
      lead_id = json.lead_id
      buyer_id = json.buyer_id
      body = json.body || ''
    }

    if (!lead_id || !buyer_id || (!body.trim() && !fileBuffer)) {
      return NextResponse.json({ error: 'Missing fields — precisa lead_id, buyer_id, e body OU file' }, { status: 400 })
    }

    const { data: lead } = await db.from('leads').select('phone').eq('id', lead_id).single()
    if (!lead?.phone) return NextResponse.json({ error: 'Lead sem telefone' }, { status: 400 })

    // Upload file to Storage if present
    let mediaUrl: string | null = null
    let mediaType: string | null = null
    if (fileBuffer && fileMimetype) {
      const timestamp = Date.now()
      const slug = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
      const path = `outgoing/${buyer_id}/${lead_id}/${timestamp}-${slug}`
      const { error: upErr } = await db.storage
        .from('wa-media')
        .upload(path, fileBuffer, { contentType: fileMimetype, upsert: true })
      if (upErr) {
        console.error('[WA send] Upload error:', upErr.message)
        return NextResponse.json({ error: `Falha no upload: ${upErr.message}` }, { status: 500 })
      }
      const { data: pub } = db.storage.from('wa-media').getPublicUrl(path)
      mediaUrl = pub.publicUrl
      mediaType = classifyMedia(fileMimetype)
    }

    // Send via wa-bridge
    const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
    const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')

    const bridgePayload: any = { number: cleanPhone, message: body }
    if (mediaUrl) {
      bridgePayload.mediaUrl = mediaUrl
      bridgePayload.mediaMimetype = fileMimetype
      bridgePayload.mediaFilename = fileName
    }

    const r = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(bridgePayload),
    })

    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ error: 'Falha' }))
      const msg = errBody?.error || 'Falha ao enviar'
      const friendly = msg.includes('No LID') || msg.includes('nao tem WhatsApp')
        ? `Este número não tem WhatsApp ativo (${cleanPhone}). Confirme o número com o lead.`
        : msg
      return NextResponse.json({ error: friendly }, { status: r.status })
    }
    const { id: waId } = await r.json()

    const { data: msg } = await db.from('whatsapp_messages').insert({
      buyer_id,
      lead_id,
      direction: 'out',
      from_phone: '',
      to_phone: cleanPhone,
      body: body || null,
      media_url: mediaUrl,
      media_type: mediaType,
      wa_message_id: waId,
      status: 'sent',
    }).select().single()

    return NextResponse.json({ message: msg })
  } catch (err: any) {
    console.error('[WA send] Exception:', err?.message)
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
