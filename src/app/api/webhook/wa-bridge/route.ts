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

    const { wa_message_id, from, to, body, type, has_media, media_url, media_type, direction, push_name, bridge_owner_buyer_id } = await request.json()
    if (!wa_message_id || !from) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    // direction='out' = mensagem que o DONO enviou (do celular ou via backfill).
    // Inbound (default): o LEAD é quem mandou (from); bridge = to.
    // Outbound: o LEAD é o destinatário (to); bridge = from.
    const isOut = direction === 'out'

    const db = createAdminClient()

    // Dedupe — com uma exceção: mensagem que já existe SEM o arquivo.
    //
    // A mídia se perde quando o download no navegador da bridge falha (o servidor
    // ficou sem memória e o renderer morre no meio, sem lançar erro). A linha fica
    // com media_type preenchido e media_url NULL — é a caixa vermelha "não foi salvo".
    // Antes, uma segunda tentativa (backfill) era descartada aqui e o furo virava
    // permanente. Agora, se a repetição TROUXE o arquivo e a linha guardada não tem,
    // a gente preenche. Só isso: nada de duplicar mensagem nem sobrescrever texto.
    const { data: existing } = await db
      .from('whatsapp_messages')
      .select('id, media_url')
      .eq('wa_message_id', wa_message_id)
      .maybeSingle()
    if (existing) {
      if (media_url && !existing.media_url) {
        await db.from('whatsapp_messages')
          .update({ media_url, ...(media_type ? { media_type } : {}) })
          .eq('id', existing.id)
        return NextResponse.json({ healed: 'media' })
      }
      return NextResponse.json({ skipped: 'duplicate' })
    }

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

    // 🔒 ÂNCORA DE SEGURANÇA: DONO da bridge que capturou a mensagem (a bridge manda no
    // payload). Uma conversa SÓ pode ser atribuída a um lead DESTE dono — nunca cruza contas.
    // Sem dono identificado, descarta (melhor perder 1 msg do que vazar conversa de terceiro).
    const bridgeOwner = (typeof bridge_owner_buyer_id === 'string' && bridge_owner_buyer_id.trim())
      ? bridge_owner_buyer_id.trim()
      : recipientBuyerId
    if (!bridgeOwner) {
      console.log('[WA Inbox] sem dono de bridge identificado — descartado (anti-vazamento)')
      return NextResponse.json({ skipped: 'no_bridge_owner' })
    }

    // Conta de VENDAS (prospect chegando pela página de vendas). Usada abaixo.
    const NEW_CLIENT_BUYER = '2b1971f5-cfa4-4256-bd9e-44c14cd61ffc'

    // "Atendimento a clientes" só vale na bridge da EMPRESA (vendas ou admin). Numa bridge de
    // cliente comum, papo com outro comprador NÃO vira atendimento — seria vazar conversa privada.
    let bridgeOwnerIsCompany = bridgeOwner === NEW_CLIENT_BUYER
    if (!bridgeOwnerIsCompany) {
      const { data: bo } = await db.from('buyers').select('is_admin').eq('id', bridgeOwner).maybeSingle()
      bridgeOwnerIsCompany = !!bo?.is_admin
    }

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
    if (clientBuyer && bridgeOwnerIsCompany) {
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
      if (!isOut && bridgeOwner === NEW_CLIENT_BUYER) {
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
        // Nome real do WhatsApp (pushname) quando vier; senão "Novo cliente XXXX".
        const waName = typeof push_name === 'string' ? push_name.trim() : ''
        const leadName = (waName.length >= 2 && waName.length <= 60 && /[a-zA-ZÀ-ÿ]/.test(waName)) ? waName : `Novo cliente ${contactPhone.slice(-4)}`
        const { data: newLead } = await db.from('leads').insert({
          name: leadName,
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
      return { ...c, memberBuyerId, ownerBuyerId, score }
    }).sort((a, b) => b.score - a.score)

    // 🔒 ESCOPO: só aceita lead que pertence ao DONO DA BRIDGE (dele direto OU delegado a um
    // membro DELE). Se o contato não é lead dele, é conversa pessoal / de outra conta → NÃO
    // grava. Era EXATAMENTE aqui que a conversa de um cliente caía na caixa de outro.
    const owned = enriched.filter(c => c.assigned_to === bridgeOwner || c.memberBuyerId === bridgeOwner)
    if (owned.length === 0) {
      console.log(`[WA Inbox] contato ${contactPhone} nao e lead do dono da bridge ${bridgeOwner} — descartado`)
      return NextResponse.json({ skipped: 'not_owner_lead' })
    }
    const match = owned[0]

    if (!match.ownerBuyerId) {
      console.log(`[WA Inbox] Lead ${match.id} sem owner valido — skip`)
      return NextResponse.json({ skipped: 'no_owner' })
    }

    // Inbox = owner REAL do lead. NUNCA recipientBuyerId.
    const inboxBuyerId = match.ownerBuyerId
    const notifyBuyerId = match.ownerBuyerId

    // 🔁 DEDUP DE SAÍDA: o app (/api/whatsapp/messages) já grava a mensagem que ELE
    // enviou. Em contato @lid/grupo a bridge não devolve ack → a linha do app fica com
    // wa_message_id NULL. Quando o message_create chega aqui (id real), em vez de inserir
    // uma 2ª linha (DUPLICATA no inbox), ATUALIZA a linha do app. Casa por lead+texto
    // (imune ao formato @lid/@c.us). Só saída.
    if (isOut && wa_message_id) {
      const findTwin = async () => {
        const { data } = await db
          .from('whatsapp_messages')
          .select('id')
          .eq('lead_id', match.id)
          .eq('direction', 'out')
          .is('wa_message_id', null)
          .eq('body', body || '')
          .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return data
      }
      // RE-CHECAGEM (fecha a CORRIDA): se o message_create chega ANTES do app commitar
      // a linha NULL, a 1ª busca não acha e sobrava duplicata. Espera 2s e tenta de novo
      // — o insert do app aterrissa nesse meio-tempo. Só depois disso é que insere.
      let pending = await findTwin()
      if (!pending) { await new Promise(r => setTimeout(r, 2000)); pending = await findTwin() }
      if (pending) {
        await db.from('whatsapp_messages').update({ wa_message_id, status: 'sent' }).eq('id', pending.id)
        return NextResponse.json({ merged: pending.id })
      }
    }

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

    // Auto-corrige o nome: lead criado como "Novo cliente XXXX" (1a msg sem pushname,
    // ex. e2e_notification) ganha o NOME REAL do WhatsApp quando o lead manda um chat
    // com pushname. Só inbound (o pushname e de quem MANDOU = o lead) e só sobrescreve
    // o nome generico — nunca um nome ja editado a mao (ex. "Toddy").
    const leadUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (!isOut) {
      const waName = typeof push_name === 'string' ? push_name.trim() : ''
      if (waName.length >= 2 && waName.length <= 60 && /[a-zA-ZÀ-ÿ]/.test(waName) && /^Novo cliente \d+$/.test(match.name || '')) {
        leadUpdates.name = waName
        console.log(`[WA Inbox] auto-rename: "${match.name}" -> "${waName}" (lead ${match.id})`)
      }
    }
    await db.from('leads').update(leadUpdates).eq('id', match.id)

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
