import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/webhook/wa-bridge
 * Receives inbound WhatsApp messages from wa-bridge on VPS.
 *
 * Routing rules (HIERARQUIA — leia antes de mexer):
 *
 *   1. Acha leads pelo phone do remetente (FROM).
 *   2. Pra cada lead candidato, resolve o "owner REAL":
 *        - Se lead.assigned_to_member -> buyer da conta do team_member
 *        - Senao -> lead.assigned_to
 *      Owner do member SEMPRE ganha de owner da agency. Sempre.
 *   3. Se ha varios candidatos (lead duplicado), desempata por:
 *        a) recipientBuyerId (buyer cujo wa_bridge_phone == TO) — so se
 *           usado realmente em multi-bridge. Em single-bridge isso aponta
 *           sempre pra agency e NAO pode sobrescrever member.
 *        b) Lead delegado (assigned_to_member NOT NULL)
 *        c) Mais recente (assigned_at desc)
 *   4. Inbox final = owner REAL do lead escolhido. recipientBuyerId
 *      NUNCA sobrescreve. Erro historico (commit 482464a) era inverter
 *      isso e fazer leads delegados pra team_member caírem na agency.
 */
export async function POST(request: NextRequest) {
  try {
    const apikey = request.headers.get('apikey')
    const expected = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
    if (apikey !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { wa_message_id, from, to, body, type, has_media, media_url, media_type, direction } = await request.json()
    if (!wa_message_id || !from) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    // direction='out' = mensagem que o DONO enviou (do celular ou via backfill).
    // Inbound (default): o LEAD é quem mandou (from); bridge = to.
    // Outbound: o LEAD é o destinatário (to); bridge = from.
    const isOut = direction === 'out'

    const db = createAdminClient()

    // Dedupe
    const { data: existing } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('wa_message_id', wa_message_id)
      .maybeSingle()
    if (existing) return NextResponse.json({ skipped: 'duplicate' })

    const normalizedFrom = String(from).replace(/\D/g, '')
    const normalizedTo = String(to || '').replace(/\D/g, '')
    // O LEAD (contato) vs o nº do bridge do dono — dependem da direção.
    const contactPhone = isOut ? normalizedTo : normalizedFrom
    const ownBridgePhone = isOut ? normalizedFrom : normalizedTo

    // Resolve recipient buyer (so usado pra desempate em lead duplicado) — pelo nº do bridge do dono
    let recipientBuyerId: string | null = null
    if (ownBridgePhone) {
      const last10To = ownBridgePhone.slice(-10)
      const last11To = ownBridgePhone.slice(-11)
      const { data: bridgeBuyer } = await db
        .from('buyers')
        .select('id')
        .or(`wa_bridge_phone.eq.${ownBridgePhone},wa_bridge_phone.ilike.%${last10To},wa_bridge_phone.ilike.%${last11To}`)
        .limit(1)
        .maybeSingle()
      recipientBuyerId = bridgeBuyer?.id || null
    }

    if (!contactPhone) return NextResponse.json({ skipped: 'no_contact' })

    // Acha leads pelo phone do CONTATO (o lead)
    const last10 = contactPhone.slice(-10)
    const last11 = contactPhone.slice(-11)

    const { data: candidates } = await db
      .from('leads')
      .select('id, assigned_to, assigned_to_member, phone, name, created_at, assigned_at')
      .or(`phone.ilike.%${last10},phone.ilike.%${last11},phone.eq.${contactPhone},phone.eq.+${contactPhone}`)
      .limit(10)

    if (!candidates || candidates.length === 0) {
      console.log(`[WA Inbox] No matching lead for phone ${contactPhone} (dir=${direction || 'in'})`)
      return NextResponse.json({ skipped: 'no_lead' })
    }

    // Pra cada candidato, resolve o owner REAL (member buyer > agency).
    // Coleta team_members em batch pra economizar queries.
    const memberIds = Array.from(new Set(candidates.map(c => c.assigned_to_member).filter(Boolean) as string[]))
    const memberBuyerById = new Map<string, string>()
    if (memberIds.length > 0) {
      const { data: members } = await db
        .from('team_members')
        .select('id, auth_user_id')
        .in('id', memberIds)
      const authIds = (members || []).map(m => m.auth_user_id).filter(Boolean) as string[]
      if (authIds.length > 0) {
        const { data: buyers } = await db
          .from('buyers')
          .select('id, auth_user_id')
          .in('auth_user_id', authIds)
        const authToBuyer = new Map<string, string>()
        for (const b of buyers || []) {
          if (b.auth_user_id) authToBuyer.set(b.auth_user_id, b.id)
        }
        for (const m of members || []) {
          if (m.auth_user_id) {
            const bid = authToBuyer.get(m.auth_user_id)
            if (bid) memberBuyerById.set(m.id, bid)
          }
        }
      }
    }

    // Score: owner valido (1000) + match c/ recipient (500, desempate)
    //        + delegado (100, prefere member sobre agency em duplicidade)
    //        + recencia (peso pequeno)
    const enriched = candidates.map(c => {
      const memberBuyerId = c.assigned_to_member ? memberBuyerById.get(c.assigned_to_member) || null : null
      const ownerBuyerId = memberBuyerId || c.assigned_to || null
      let score = 0
      if (ownerBuyerId) score += 1000
      if (recipientBuyerId && ownerBuyerId === recipientBuyerId) score += 500
      if (c.assigned_to_member && memberBuyerId) score += 100
      const t = c.assigned_at || c.created_at
      if (t) score += new Date(t).getTime() / 1e10
      return { ...c, ownerBuyerId, score }
    }).sort((a, b) => b.score - a.score)

    const match = enriched[0]

    if (!match.ownerBuyerId) {
      console.log(`[WA Inbox] Lead ${match.id} sem owner valido — skip`)
      return NextResponse.json({ skipped: 'no_owner' })
    }

    // Inbox = owner REAL do lead. NUNCA recipientBuyerId.
    const inboxBuyerId = match.ownerBuyerId
    const notifyBuyerId = match.ownerBuyerId

    await db.from('whatsapp_messages').insert({
      buyer_id: inboxBuyerId,
      lead_id: match.id,
      direction: isOut ? 'out' : 'in',
      from_phone: normalizedFrom,
      to_phone: to || '',
      body: body || '',
      media_type: media_type || (has_media ? (type || 'media') : null),
      media_url: media_url || null,
      wa_message_id,
      status: isOut ? 'sent' : 'delivered',
    })

    await db.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', match.id)

    // Push só pra mensagem RECEBIDA (não pra mensagem que o próprio dono mandou)
    if (!isOut) try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      const preview = body
        ? String(body).slice(0, 80)
        : media_type === 'audio' ? '🎤 Mensagem de voz'
        : media_type === 'image' ? '📷 Enviou uma imagem'
        : media_type === 'video' ? '🎥 Enviou um vídeo'
        : media_type ? '📎 Enviou um arquivo' : 'Nova mensagem'
      pushToBuyer(notifyBuyerId, {
        title: `💬 ${match.name || 'Lead'}`,
        body: preview,
        url: `/dashboard/whatsapp?lead=${match.id}`,
        tag: `msg-${match.id}`,
      }).catch(err => console.error('[Push msg] err', err))
    } catch {}

    return NextResponse.json({ success: true, lead_id: match.id, buyer_id: inboxBuyerId })
  } catch (err: any) {
    console.error('[WA Webhook] Error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
