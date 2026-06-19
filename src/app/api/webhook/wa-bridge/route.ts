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

    // 👥 É um CLIENTE (comprador cadastrado)? Atendimento a clientes é um canal
    // SEPARADO do de leads (mesmo número, mas caixas distintas; só admins veem).
    // Tem prioridade: se o contato é um buyer, a conversa é de cliente, não lead.
    // IMPORTANTE: buyers.phone vem FORMATADO ('+1(442)234-4782'), então comparamos
    // os DÍGITOS normalizados (últimos 10) — ilike com dígitos puros não casaria.
    const cph10 = contactPhone.slice(-10)
    const { data: activeBuyers } = await db.from('buyers').select('id, name, phone, whatsapp').eq('is_active', true)
    const clientBuyer = (activeBuyers || []).find(b => {
      const p1 = String(b.phone || '').replace(/\D/g, '').slice(-10)
      const p2 = String(b.whatsapp || '').replace(/\D/g, '').slice(-10)
      return cph10.length === 10 && (p1 === cph10 || p2 === cph10)
    })
    if (clientBuyer) {
      const { data: dupC } = await db.from('client_messages').select('id').eq('wa_message_id', wa_message_id).maybeSingle()
      if (dupC) return NextResponse.json({ skipped: 'duplicate_client' })
      await db.from('client_messages').insert({
        client_buyer_id: clientBuyer.id,
        direction: isOut ? 'out' : 'in',
        from_phone: normalizedFrom,
        to_phone: to || '',
        body: body || '',
        media_type: media_type || (has_media ? (type || 'media') : null),
        media_url: media_url || null,
        wa_message_id,
        status: isOut ? 'sent' : 'received',
      })
      // Mensagem de cliente NÃO gera aviso no grupo (evita spam) — só entra na
      // caixa de Atendimento a Clientes, onde o admin vê e responde.
      return NextResponse.json({ success: true, client_buyer_id: clientBuyer.id })
    }

    // Acha leads pelo phone do CONTATO (o lead)
    const last10 = contactPhone.slice(-10)
    const last11 = contactPhone.slice(-11)

    const { data: candidates } = await db
      .from('leads')
      .select('id, assigned_to, assigned_to_member, phone, name, created_at, assigned_at')
      .or(`phone_digits.eq.${contactPhone},phone_digits.ilike.%${last10}`)
      .limit(10)

    if (!candidates || candidates.length === 0) {
      // 🆕 NOVO CLIENTE: caiu na bridge de VENDAS (18632808696 = Lead4Pro /
      // regiane@myhomefirst.us). Não é lead de seguro — é um prospect chegando pela
      // página de vendas. Cria um lead na pipeline do Lead4Pro pra Regiane atender.
      // NÃO conta nas métricas (dashboard filtra esse buyer) e NÃO avisa o grupo;
      // já nasce com notified_at (fora da reconciliação/spam). Só na 1ª mensagem —
      // as próximas casam esse lead e caem no fluxo normal de inbox.
      const NEW_CLIENT_BUYER = '2b1971f5-cfa4-4256-bd9e-44c14cd61ffc'
      if (!isOut && recipientBuyerId === NEW_CLIENT_BUYER) {
        const nowIso = new Date().toISOString()
        // Dedup anti-corrida: 2 msgs do MESMO numero novo chegando juntas criavam 2
        // leads "Novo cliente". Re-checa o telefone exato AGORA (a checagem de
        // candidates roda antes; o lead irmao pode ter sido criado no meio). Se ja
        // existe lead na conta de vendas com esse telefone, anexa a msg e sai.
        const { data: dupeLead } = await db.from('leads')
          .select('id').eq('assigned_to', NEW_CLIENT_BUYER).eq('phone_digits', contactPhone)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        if (dupeLead) {
          await db.from('whatsapp_messages').insert({
            buyer_id: NEW_CLIENT_BUYER, lead_id: dupeLead.id, direction: 'in',
            from_phone: normalizedFrom, to_phone: to || '', body: body || '',
            media_type: media_type || (has_media ? (type || 'media') : null),
            media_url: media_url || null, wa_message_id, status: 'delivered',
          })
          return NextResponse.json({ success: true, existing_client_lead: dupeLead.id })
        }
        const { data: newLead } = await db.from('leads').insert({
          name: `Novo cliente ${contactPhone.slice(-4)}`,
          phone: contactPhone, email: '', city: '', state: '',
          interest: 'Quer comprar leads', campaign_name: 'NOVO CLIENTE (vendas)',
          type: 'hot', status: 'assigned', product_type: 'lead',
          assigned_to: NEW_CLIENT_BUYER, assigned_at: nowIso, notified_at: nowIso,
        }).select('id').single()
        if (newLead) {
          const { data: pipe } = await db.from('pipelines')
            .select('id, stages:pipeline_stages(id, position)')
            .eq('buyer_id', NEW_CLIENT_BUYER).eq('is_default', true).maybeSingle()
          if (pipe?.stages?.length) {
            const firstStage = (pipe.stages as any[]).sort((a, b) => a.position - b.position)[0]
            await db.from('pipeline_leads').upsert({
              lead_id: newLead.id, pipeline_id: pipe.id, stage_id: firstStage.id, position: 0, moved_at: nowIso,
            }, { onConflict: 'lead_id,pipeline_id' })
          }
          await db.from('whatsapp_messages').insert({
            buyer_id: NEW_CLIENT_BUYER, lead_id: newLead.id, direction: 'in',
            from_phone: normalizedFrom, to_phone: to || '', body: body || '',
            media_type: media_type || (has_media ? (type || 'media') : null),
            media_url: media_url || null, wa_message_id, status: 'delivered',
          })
          console.log(`[WA Inbox] NOVO CLIENTE → Lead4Pro: lead ${newLead.id} (${contactPhone})`)
          return NextResponse.json({ success: true, new_client_lead: newLead.id })
        }
      }
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
