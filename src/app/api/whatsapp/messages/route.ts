import { NextRequest, NextResponse } from 'next/server'
import { checkSendRate } from '@/lib/send-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBuyerOwnsLead } from '@/lib/lead-ownership'
import { getBridgeForBuyer } from '@/lib/wa-bridge'
import { callerBuyer, canActAs } from '@/lib/api-auth'
import { renderTemplate } from '@/lib/template-render'

/** GET /api/whatsapp/messages?lead_id=X&buyer_id=Y — thread pra lead (com validacao de ownership) */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const leadId = url.searchParams.get('lead_id')
  const buyerId = url.searchParams.get('buyer_id')

  if (!leadId && !buyerId) {
    return NextResponse.json({ error: 'Missing lead_id or buyer_id' }, { status: 400 })
  }

  const db = createAdminClient()

  // 🔒 Exige sessão. Antes: abrir thread por ?lead_id= (sem buyer_id) NÃO validava nada.
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (leadId) {
    // Só o dono ATUAL do lead (ou admin) lê a conversa dele.
    if (!caller.isAdmin) {
      const own = await assertBuyerOwnsLead(db, caller.id, leadId)
      if (!own.ok) return NextResponse.json({ error: own.reason || 'Acesso negado' }, { status: 403 })
    }
  } else if (buyerId) {
    if (!canActAs(caller, buyerId)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  let query = db.from('whatsapp_messages').select('*').order('sent_at', { ascending: true })
  if (leadId) query = query.eq('lead_id', leadId)
  if (buyerId && !leadId) query = query.eq('buyer_id', buyerId).is('read_at', null).eq('direction', 'in')

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A conversa do lead inclui os SMS (caso Robson, 2026-08-10): o lead respondia o
  // SMS automático e a resposta ficava invisível — só o admin sabia, o dono do lead
  // não via em lugar nenhum. Aqui os SMS entram na MESMA linha do tempo, marcados
  // com channel:'sms' (a tela mostra a etiqueta; o composer continua só WhatsApp).
  // Só o que materializou de verdade: sent/delivered/received/failed — agendado e
  // cancelado não são eventos da conversa. Tolerante: sem tabela, segue só WhatsApp.
  if (leadId) {
    try {
      const { data: sms } = await db.from('sms_messages')
        .select('id, direction, from_phone, to_phone, body, status, created_at')
        .eq('lead_id', leadId)
        .in('status', ['sent', 'delivered', 'received', 'failed'])
        .order('created_at', { ascending: true }).limit(200)
      const smsMsgs = (sms || []).map(s => ({
        id: `sms-${s.id}`,
        direction: s.direction === 'in' ? 'in' : 'out',
        body: s.body || '',
        from_phone: s.from_phone || '',
        to_phone: s.to_phone || '',
        sent_at: s.created_at,
        status: s.status,
        read_at: s.created_at,   // SMS não participa do contador de não lidas
        channel: 'sms',
      }))
      const tudo = [...(data || []), ...smsMsgs]
        .sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
      return NextResponse.json({ messages: tudo })
    } catch { /* segue só com whatsapp */ }
  }

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

    // 🔒 Só o próprio buyer (ou admin) manda em nome dele — não dá pra enviar como outra conta.
    const caller = await callerBuyer(db)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canActAs(caller, buyer_id)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    // 🔒 Bloqueia envio por quem nao e mais dono do lead
    const own = await assertBuyerOwnsLead(db, buyer_id, lead_id)
    if (!own.ok) return NextResponse.json({ error: own.reason || 'Acesso negado' }, { status: 403 })

    // Variáveis também na caixa de mensagem (caso Aroldo, 2026-08-10): a corretora
    // colou um texto com [primeiro_nome] direto na Conversa e o cliente recebeu o
    // código cru — a caixa não substituía nada, só os templates. Agora, se o texto
    // tem cara de variável, renderiza com os dados do lead antes de enviar.
    if (body && /[{\[(]\s*[a-zA-ZÀ-ú][a-zA-ZÀ-ú _-]{1,30}\s*[}\])]/.test(body)) {
      try {
        const [{ data: leadVar }, { data: agenteVar }] = await Promise.all([
          db.from('leads').select('name, phone, email, state, interest, city').eq('id', lead_id).maybeSingle(),
          db.from('buyers').select('name, email, phone').eq('id', buyer_id).maybeSingle(),
        ])
        if (leadVar) body = renderTemplate(body, leadVar, agenteVar || {})
      } catch { /* sem dados, envia como digitado */ }
    }

    // 🔒 Multi-bridge: msg sai do WhatsApp DO DONO DO LEAD (assigned_to_member > assigned_to).
    // buyer_id do request tem que bater com o dono (ja garantido pelo assertBuyerOwnsLead acima).
    const bridge = await getBridgeForBuyer(db, buyer_id)
    const naoConectado = NextResponse.json({
      error: 'Seu WhatsApp ainda nao esta conectado. Abra Configuracoes > Conectar WhatsApp e escaneie o QR code.',
    }, { status: 403 })
    // Sem bridge configurada (sem url/key) = nada a fazer.
    if (!bridge) return naoConectado

    // wa_bridge_status no banco e um cache que so atualiza quando a tela de QR e aberta.
    // Se o cache nao diz 'connected', NAO bloqueia de cara: confirma AO VIVO no bridge
    // (evita falso-negativo logo apos uma reconexao) e faz self-heal do banco.
    if (bridge.status !== 'connected') {
      let liveReady = false
      try {
        const sres = await fetch(`${bridge.url}/status`, {
          headers: { apikey: bridge.key },
          signal: AbortSignal.timeout(5000),
        })
        if (sres.ok) {
          const s = await sres.json()
          liveReady = !!s.ready
          if (liveReady) {
            const upd: Record<string, unknown> = { wa_bridge_status: 'connected' }
            if (s.number) upd.wa_bridge_phone = String(s.number)
            await db.from('buyers').update(upd).eq('id', buyer_id)
          }
        }
      } catch {
        // bridge inalcançavel = trata como desconectado
      }
      if (!liveReady) return naoConectado
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

    // Send via a bridge do PROPRIO buyer (multi-tenant)
    // 🛑 LIMITADOR por conta (incidente 2026-07-31)
    const rate = await checkSendRate(db, buyer_id)
    if (!rate.ok) return NextResponse.json({ error: rate.reason, rate_limited: true }, { status: 429 })

    const bridgeUrl = bridge.url
    const bridgeKey = bridge.key
    const cleanPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')

    const bridgePayload: any = { number: cleanPhone, message: body }
    if (mediaUrl) {
      bridgePayload.mediaUrl = mediaUrl
      bridgePayload.mediaMimetype = fileMimetype
      bridgePayload.mediaFilename = fileName
    }

    // RETRY: o bridge (whatsapp-web.js/puppeteer) solta erro TRANSITÓRIO às vezes —
    // "Not connected" por blip momentâneo, "Promise was collected", 503, rede.
    // Retenta até 3x (backoff 0.8/1.6s). Só NÃO retenta número sem WhatsApp.
    let sent: any = null
    let lastErr = 'Falha ao enviar'
    let lastStatus = 500
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${bridgeUrl}/send`, {
          method: 'POST',
          headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(bridgePayload),
        })
        if (r.ok) { sent = await r.json().catch(() => ({ id: null })); break }
        const errBody = await r.json().catch(() => ({ error: 'Falha' }))
        lastErr = errBody?.error || 'Falha ao enviar'
        lastStatus = r.status
      } catch (e: any) {
        lastErr = e?.message || 'fetch failed'
        lastStatus = 502
      }
      const permanent = /No LID|nao tem WhatsApp/i.test(lastErr)
      if (permanent || attempt === 2) break
      await new Promise(res => setTimeout(res, 800 * (attempt + 1)))
    }

    // 🛟 FALLBACK (2026-07-27, caso Ericka): o getNumberId da bridge às vezes dá FALSO
    // "não tem WhatsApp" pra número que JÁ conversou (flakiness da página do WhatsApp).
    // Se o lead tem histórico com chat id conhecido, reenvia direto pro endereço salvo —
    // a bridge pula a consulta quando `number` já contém '@'. Só roda com histórico real.
    if (!sent && /nao tem WhatsApp/i.test(lastErr)) {
      try {
        const { data: hist } = await db.from('whatsapp_messages')
          .select('wa_message_id').eq('lead_id', lead_id)
          .not('wa_message_id', 'is', null)
          .order('sent_at', { ascending: false }).limit(5)
        const remote = (hist || [])
          .map(h => String(h.wa_message_id || '').match(/^(?:true|false)_([^_]+@(?:lid|c\.us))_/)?.[1])
          .find(Boolean)
        if (remote) {
          const r2 = await fetch(`${bridgeUrl}/send`, {
            method: 'POST',
            headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bridgePayload, number: remote }),
          })
          if (r2.ok) {
            sent = await r2.json().catch(() => ({ id: null }))
            console.log(`[WA send] falso-negativo contornado via chat conhecido ${remote} (lead ${lead_id})`)
          }
        }
      } catch (e: any) { console.warn('[WA send] fallback chat conhecido:', e?.message) }
    }

    if (!sent) {
      // Bridge caída de verdade → marca o cache pra parar de mentir 'connected'
      if (lastStatus === 503 || /Not connected|not ready/i.test(lastErr)) {
        await db.from('buyers').update({ wa_bridge_status: 'disconnected' }).eq('id', buyer_id)
      }
      const friendly = /No LID|nao tem WhatsApp/i.test(lastErr)
        ? `Este número não tem WhatsApp ativo (${cleanPhone}). Confirme o número com o lead.`
        : (lastStatus === 503 || /Not connected|not ready/i.test(lastErr))
          ? 'Seu WhatsApp desconectou. Reconecte em Configurações → Conectar WhatsApp e tente de novo (sua mensagem continua aqui no campo).'
          : lastErr
      return NextResponse.json({ error: friendly }, { status: lastStatus })
    }
    const waId = sent?.id || null

    // 🔁 ANTI-DUPLICAÇÃO (fecha a corrida): em contato @lid/grupo a bridge não devolve
    // ack (waId null) e o evento message_create grava a MESMA saída com id real. O
    // webhook já faz merge quando ELE chega depois — mas se ele chegar ANTES deste
    // insert, sobrava duplicata. Aqui, quando NÃO temos ack, checamos se o gêmeo com
    // id real já foi gravado (mesmo lead+texto, recente); se sim, devolvemos ele em
    // vez de inserir a 2ª cópia.
    if (!waId && !mediaUrl) {
      const { data: twin } = await db.from('whatsapp_messages')
        .select('*')
        .eq('lead_id', lead_id)
        .eq('direction', 'out')
        .not('wa_message_id', 'is', null)
        .eq('body', body || '')
        .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (twin) return NextResponse.json({ message: twin })
    }

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
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (lead_id && !caller.isAdmin) {
    const own = await assertBuyerOwnsLead(db, caller.id, lead_id)
    if (!own.ok) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (buyer_id && !canActAs(caller, buyer_id)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let query = db.from('whatsapp_messages').update({ read_at: new Date().toISOString() })
    .eq('direction', 'in').is('read_at', null)
  if (lead_id) query = query.eq('lead_id', lead_id)
  if (buyer_id) query = query.eq('buyer_id', buyer_id)

  await query
  return NextResponse.json({ success: true })
}
