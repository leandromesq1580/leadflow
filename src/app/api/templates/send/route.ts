import { NextRequest, NextResponse } from 'next/server'
import { checkSendRate } from '@/lib/send-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { resolveSendBridge } from '@/lib/wa-bridge'
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

    // 🛑 LIMITADOR (incidente 2026-07-31): teto de envios por conta — mata rajada
    // de máquina antes de virar spam nos leads e queda da sessão do WhatsApp.
    const rate = await checkSendRate(db, buyer_id)
    if (!rate.ok) return NextResponse.json({ error: rate.reason, rate_limited: true }, { status: 429 })
    // Envia pela bridge do DONO do lead (não pela global/Regiane)
    const sb = await resolveSendBridge(db, buyer_id)
    const cleanPhone = lead.phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')

    // Envio com RETRY: o bridge (whatsapp-web.js/puppeteer) às vezes solta erro
    // TRANSITÓRIO — "Promise was collected", contexto destruído, Chrome engasgado,
    // 503 not-ready, rede. Retenta até 3x com backoff (0.8s, 1.6s). Só NÃO retenta
    // erro PERMANENTE (número sem WhatsApp), que falha na hora.
    let sendRes: any = null
    let lastErr = 'Falha ao enviar WhatsApp'
    let lastStatus = 500
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // TIMEOUT obrigatório: sem ele, uma bridge travada penduraria este fetch
        // pra sempre (× 3 tentativas) e a tela do usuário ficava esperando.
        const res = await fetch(`${sb.url}/send`, {
          method: 'POST',
          headers: { apikey: sb.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: cleanPhone, message: body }),
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) { sendRes = await res.json().catch(() => ({ id: null })); break }
        const err = await res.json().catch(() => ({ error: 'Falha desconhecida' }))
        lastErr = err?.error || 'Falha ao enviar WhatsApp'
        lastStatus = res.status
      } catch (e: any) {
        lastErr = e?.message || 'fetch failed'
        lastStatus = 502
      }
      const permanent = /No LID|nao tem WhatsApp/i.test(lastErr)
      if (permanent || attempt === 2) break
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
    }

    if (!sendRes) {
      // Erro TRADUZIDO (2026-07-30): antes vazava o erro cru da bridge ("Not connected")
      // pro cliente — mesma tradução do /api/whatsapp/messages. Também marca a bridge
      // como desconectada pro app parar de dizer "conectado" e mostrar o QR.
      const desconectada = lastStatus === 503 || /Not connected|not ready/i.test(lastErr)
      if (desconectada) {
        try { await db.from('buyers').update({ wa_bridge_status: 'disconnected' }).eq('id', buyer_id) } catch {}
      }
      const friendly = /No LID|nao tem WhatsApp/i.test(lastErr)
        ? `Este número não tem WhatsApp ativo (${cleanPhone}). Confirme o número com o lead.`
        : desconectada
          ? 'Seu WhatsApp desconectou. Vá em Configurações → Conectar WhatsApp e escaneie o QR code — depois é só reenviar (sua mensagem continua salva aqui).'
          : lastErr
      return NextResponse.json({ error: friendly }, { status: lastStatus })
    }

    // Salva na thread de conversa do lead (aparece na aba "Conversa")
    await db.from('whatsapp_messages').insert({
      buyer_id,
      lead_id,
      direction: 'out',
      from_phone: sb.phone,
      to_phone: cleanPhone,
      body,
      wa_message_id: sendRes?.id || null,
      status: 'sent',
    })
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
