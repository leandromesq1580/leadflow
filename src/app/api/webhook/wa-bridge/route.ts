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
    const normalizedTo = (to || '').replace(/\D/g, '')

    // 🔒 MULTI-BRIDGE: identifica QUAL buyer e dono do numero que recebeu
    // a msg (cada buyer tem seu wa_bridge_phone proprio na migration 011).
    // Sem isso, qdo Fernanda manda msg pra Flavia e Flavia responde, a resposta
    // pode cair na inbox da Regiane se houver lead duplicado da Flavia atribuido
    // a ela — webhook ficava resolvendo aleatorio pq .or() nao tem ordem.
    let recipientBuyerId: string | null = null
    if (normalizedTo) {
      const last10To = normalizedTo.slice(-10)
      const last11To = normalizedTo.slice(-11)
      const { data: bridgeBuyer } = await db
        .from('buyers')
        .select('id, auth_user_id')
        .or(`wa_bridge_phone.eq.${normalizedTo},wa_bridge_phone.ilike.%${last10To},wa_bridge_phone.ilike.%${last11To}`)
        .limit(1)
        .maybeSingle()
      recipientBuyerId = bridgeBuyer?.id || null
    }

    // Phone matching: try exact, then last-10 digits, then last-11
    const last10 = normalizedFrom.slice(-10)
    const last11 = normalizedFrom.slice(-11)

    const { data: candidates } = await db
      .from('leads')
      .select('id, assigned_to, assigned_to_member, phone, name, created_at, assigned_at')
      .or(`phone.ilike.%${last10},phone.ilike.%${last11},phone.eq.${normalizedFrom},phone.eq.+${normalizedFrom}`)
      .limit(10)

    // 🎯 MATCH PRIORITARIO: se sabemos qual buyer recebeu (recipientBuyerId),
    // prefere lead atribuido direto a ele OU delegado a team_member dele.
    let match: any = null
    if (recipientBuyerId && candidates && candidates.length > 0) {
      // 1) Lead direto do recipient buyer
      match = candidates.find(c => c.assigned_to === recipientBuyerId)

      // 2) Lead delegado a team_member do recipient buyer
      if (!match) {
        const { data: recipBuyer } = await db
          .from('buyers')
          .select('auth_user_id')
          .eq('id', recipientBuyerId)
          .maybeSingle()
        if (recipBuyer?.auth_user_id) {
          const { data: tm } = await db
            .from('team_members')
            .select('id')
            .eq('auth_user_id', recipBuyer.auth_user_id)
            .maybeSingle()
          if (tm?.id) {
            match = candidates.find(c => c.assigned_to_member === tm.id)
          }
        }
      }
    }

    // Fallback: ordena candidates determinante pra evitar resolucao aleatoria
    // (delegados primeiro, depois mais recentes)
    if (!match) {
      const sorted = (candidates || []).slice().sort((a: any, b: any) => {
        const aDelegated = a.assigned_to_member ? 1 : 0
        const bDelegated = b.assigned_to_member ? 1 : 0
        if (aDelegated !== bDelegated) return bDelegated - aDelegated
        const aTime = (a.assigned_at || a.created_at) ? new Date(a.assigned_at || a.created_at).getTime() : 0
        const bTime = (b.assigned_at || b.created_at) ? new Date(b.assigned_at || b.created_at).getTime() : 0
        return bTime - aTime
      })
      match = sorted.find((c: any) => c.assigned_to) || sorted[0]
    }

    if (!match || !match.assigned_to) {
      console.log(`[WA Inbox] No matching lead for phone ${normalizedFrom} (to=${normalizedTo})`)
      return NextResponse.json({ skipped: 'no_lead' })
    }

    // 🔒 PRIVACIDADE: define inbox final
    // Prioridade: (1) recipientBuyerId (autoridade do bridge — Fernanda recebeu = msg da Fernanda)
    //             (2) assigned_to_member -> buyer do membro
    //             (3) assigned_to da agency
    let inboxBuyerId = match.assigned_to as string
    let notifyBuyerId = match.assigned_to as string

    if (recipientBuyerId) {
      inboxBuyerId = recipientBuyerId
      notifyBuyerId = recipientBuyerId
    } else if (match.assigned_to_member) {
      const { data: member } = await db
        .from('team_members')
        .select('auth_user_id')
        .eq('id', match.assigned_to_member)
        .maybeSingle()
      if (member?.auth_user_id) {
        const { data: memberBuyer } = await db
          .from('buyers')
          .select('id')
          .eq('auth_user_id', member.auth_user_id)
          .maybeSingle()
        if (memberBuyer?.id) {
          inboxBuyerId = memberBuyer.id
          notifyBuyerId = memberBuyer.id
        }
      }
    }

    await db.from('whatsapp_messages').insert({
      buyer_id: inboxBuyerId,
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

    // Push notification pro agente (dono atual do lead)
    try {
      const { pushToBuyer } = await import('@/lib/push-notify')
      const preview = body
        ? body.slice(0, 80)
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
    } catch (e) {}

    return NextResponse.json({ success: true, lead_id: match.id })
  } catch (err: any) {
    console.error('[WA Webhook] Error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
