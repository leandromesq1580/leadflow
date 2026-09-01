import { NextRequest, NextResponse } from 'next/server'
import { checkSendRate } from '@/lib/send-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { resolveSendBridge } from '@/lib/wa-bridge'
import { Resend } from 'resend'
import { getLocale } from '@/lib/locale'
import { localizeSystemTemplate } from '@/lib/system-template-i18n'

/** POST /api/templates/send — render template and send via WhatsApp or Email */
export async function POST(request: NextRequest) {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const { template_id, lead_id, buyer_id, override_body } = await request.json()
  if ((!template_id && !override_body) || !lead_id || !buyer_id) {
    return NextResponse.json({ error: L('Campos obrigatórios ausentes', 'Required fields are missing', 'Faltan campos obligatorios') }, { status: 400 })
  }

  const db = createAdminClient()

  const [templateRes, leadRes, buyerRes] = await Promise.all([
    template_id ? db.from('templates').select('*').eq('id', template_id).single() : Promise.resolve({ data: null }),
    db.from('leads').select('*').eq('id', lead_id).single(),
    db.from('buyers').select('name, email, phone').eq('id', buyer_id).single(),
  ])

  const template = templateRes.data ? localizeSystemTemplate(templateRes.data, locale) : null
  const lead = leadRes.data
  const agent = buyerRes.data

  if (!lead || !agent) return NextResponse.json({ error: L('Lead ou corretor não encontrado', 'Lead or producer not found', 'No se encontró el prospecto o el productor') }, { status: 404 })

  const type = template?.type || 'whatsapp'
  const body = override_body || renderTemplate(template.body, lead, agent)
  const subject = template?.subject ? renderTemplate(template.subject, lead, agent) : null

  if (type === 'whatsapp') {
    if (!lead.phone) return NextResponse.json({ error: L('Lead sem telefone', 'Lead has no phone number', 'El prospecto no tiene teléfono') }, { status: 400 })

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
        ? L(`Este número não tem WhatsApp ativo (${cleanPhone}). Confirme o número com o lead.`, `This number does not have active WhatsApp (${cleanPhone}). Confirm the number with the lead.`, `Este número no tiene WhatsApp activo (${cleanPhone}). Confirma el número con el prospecto.`)
        : desconectada
          ? L('Seu WhatsApp desconectou. Vá em Configurações → Conectar WhatsApp e escaneie o código QR. Depois, reenvie; sua mensagem continua salva.', 'Your WhatsApp disconnected. Go to Settings → Connect WhatsApp and scan the QR code. Then resend; your message is still saved.', 'Tu WhatsApp se desconectó. Ve a Configuración → Conectar WhatsApp y escanea el código QR. Luego vuelve a enviar; tu mensaje sigue guardado.')
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
    if (!lead.email) return NextResponse.json({ error: L('Lead sem e-mail', 'Lead has no email address', 'El prospecto no tiene correo electrónico') }, { status: 400 })
    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) return NextResponse.json({ error: 'Resend not configured' }, { status: 500 })

    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: `${agent.name} <onboarding@resend.dev>`,
      to: lead.email,
      subject: subject || (locale === 'en' ? `Message from ${agent.name}` : locale === 'es' ? `Mensaje de ${agent.name}` : `Mensagem de ${agent.name}`),
      html: body.replace(/\n/g, '<br/>'),
    })
  }

  // Log activity
  await db.from('follow_ups').insert({
    lead_id, buyer_id,
    type: type === 'whatsapp' ? 'whatsapp' : 'email',
    description: template?.name
      ? `${locale === 'es' ? 'Plantilla' : 'Template'}: ${template.name}`
      : locale === 'en' ? 'Custom message' : locale === 'es' ? 'Mensaje personalizado' : 'Mensagem customizada',
    completed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, sent_body: body })
}
