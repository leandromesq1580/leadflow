import { NextRequest, NextResponse } from 'next/server'
import { checkSendRate } from '@/lib/send-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/template-render'
import { resolveSendBridge } from '@/lib/wa-bridge'
import { Resend } from 'resend'
import { getLocale } from '@/lib/locale'
import { localizeLeadTemplate } from '@/lib/lead-message-template'
import { requireLeadMessageLocale } from '@/lib/lead-message-locale'
import { atorDaSessao, podeOperarQuadro, leadPertenceAoQuadro } from '@/lib/pipeline-guard'

export const maxDuration = 120

/** POST /api/templates/send — render template and send via WhatsApp or Email */
export async function POST(request: NextRequest) {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const { template_id, lead_id, buyer_id, override_body, preview, automated, channel } = await request.json()
  if ((!template_id && !override_body) || !lead_id || !buyer_id) {
    return NextResponse.json({ error: L('Campos obrigatórios ausentes', 'Required fields are missing', 'Faltan campos obligatorios') }, { status: 400 })
  }

  const db = createAdminClient()
  const actor = await atorDaSessao(db)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await podeOperarQuadro(db, actor, buyer_id)) || (!actor.isAdmin && !(await leadPertenceAoQuadro(db, lead_id, buyer_id)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [templateRes, leadRes, buyerRes] = await Promise.all([
    template_id ? db.from('templates').select('*').eq('id', template_id).single() : Promise.resolve({ data: null }),
    db.from('leads').select('*').eq('id', lead_id).single(),
    db.from('buyers').select('name, email, phone').eq('id', buyer_id).single(),
  ])

  let template = templateRes.data
  const lead = leadRes.data
  const agent = buyerRes.data

  if (!lead || !agent) return NextResponse.json({ error: L('Lead ou corretor não encontrado', 'Lead or producer not found', 'No se encontró el prospecto o el productor') }, { status: 404 })

  if (template_id && !template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (template && !template.is_system && template.buyer_id !== buyer_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const type = template?.type || (channel === 'email' ? 'email' : 'whatsapp')
  let body: string
  let subject: string | null = null
  let messageLocale = locale
  try {
    if (!override_body || automated) {
      messageLocale = requireLeadMessageLocale(lead)
      const copy = await localizeLeadTemplate(db, override_body ? { name: '', body: override_body } : template, lead)
      body = renderTemplate(copy.body, lead, agent, messageLocale)
      subject = copy.subject ? renderTemplate(copy.subject, lead, agent, messageLocale) : null
      if (!override_body) template = copy
    } else {
      // Deliberately typed messages stay as written; automatic copy is always localized.
      body = override_body
    }
  } catch {
    return NextResponse.json({ error: L(
      'Não foi possível preparar a mensagem no idioma do lead. Nenhuma mensagem foi enviada. Confira o idioma do cadastro e tente novamente.',
      'Could not prepare the message in the lead’s language. Nothing was sent. Check the lead language and try again.',
      'No se pudo preparar el mensaje en el idioma del lead. No se envió ningún mensaje. Revisa el idioma del lead e inténtalo de nuevo.',
    ) }, { status: 422 })
  }
  if (preview) return NextResponse.json({ sent_body: body, subject, message_locale: messageLocale })

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
      subject: subject || (messageLocale === 'en' ? `Message from ${agent.name}` : messageLocale === 'es' ? `Mensaje de ${agent.name}` : `Mensagem de ${agent.name}`),
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
