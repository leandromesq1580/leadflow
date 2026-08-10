import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature, isOptOut } from '@/lib/twilio'
import { notifyGroupSmsReply, notifySmsReplyToOwner } from '@/lib/notifications'
import { pushToBuyer } from '@/lib/push-notify'

/**
 * POST /api/webhook/twilio-sms — resposta de SMS chegando (configurar este URL
 * no número Twilio em "A message comes in").
 * Valida a assinatura, casa o remetente com o lead, grava em sms_messages
 * (direction=in), avisa o grupo de controle e trata opt-out (STOP).
 * Resposta: TwiML vazio (não responde nada automático ao lead).
 */
export async function POST(request: NextRequest) {
  const twiml = (xml = '<Response></Response>') =>
    new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { headers: { 'Content-Type': 'text/xml' } })

  const raw = await request.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v

  // Assinatura: monta o URL público exato (Twilio assina o URL configurado)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'lead4producers.com'
  const url = `https://${host}/api/webhook/twilio-sms`
  const sig = request.headers.get('x-twilio-signature')
  if (!validateTwilioSignature(url, params, sig)) {
    console.warn('[Twilio SMS] assinatura inválida — descartado')
    return new Response('Forbidden', { status: 403 })
  }

  const from = params.From || ''
  const to = params.To || ''
  const body = params.Body || ''
  const sid = params.MessageSid || params.SmsSid || ''
  if (!from || !sid) return twiml()

  const db = createAdminClient()

  // Dedupe por SID (Twilio re-tenta o webhook em timeout)
  const { data: dup } = await db.from('sms_messages').select('id').eq('twilio_sid', sid).maybeSingle()
  if (dup) return twiml()

  // Casa o lead pelos últimos 10 dígitos (mesmo padrão do webhook do WhatsApp)
  const digits = from.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const { data: candidates } = await db.from('leads')
    .select('id, name, assigned_to, created_at')
    .or(`phone.ilike.%${last10},phone.eq.${digits},phone.eq.+${digits}`)
    .order('created_at', { ascending: false })
    .limit(1)
  const lead = candidates?.[0] || null

  await db.from('sms_messages').insert({
    lead_id: lead?.id || null,
    direction: 'in',
    from_phone: digits,
    to_phone: to.replace(/\D/g, ''),
    body,
    status: 'received',
    twilio_sid: sid,
  })

  // Opt-out: marca o lead e NÃO alerta o grupo (é despedida, não interesse)
  if (isOptOut(body)) {
    if (lead?.id) {
      try { await db.from('leads').update({ sms_opted_out: true }).eq('id', lead.id) } catch {}
    }
    console.log(`[Twilio SMS] opt-out de ${digits}`)
    return twiml()
  }

  // Alerta o grupo de controle (não bloqueia a resposta ao Twilio)
  try { await notifyGroupSmsReply(lead?.name || null, digits, body) } catch (e) {
    console.error('[Twilio SMS] alerta grupo falhou:', (e as any)?.message)
  }

  // Avisa o DONO do lead (caso Robson, 2026-08-10): antes o corretor mandava SMS,
  // o lead respondia e só o admin ficava sabendo. WhatsApp pela bridge global +
  // push no celular; a resposta em si já aparece na aba Conversa (etiqueta SMS).
  if (lead?.id && lead?.assigned_to) {
    try { await notifySmsReplyToOwner(lead.assigned_to, lead.name || null, lead.id, body) } catch (e) {
      console.error('[Twilio SMS] aviso ao dono falhou:', (e as any)?.message)
    }
    try {
      await pushToBuyer(lead.assigned_to, {
        title: `💬 ${lead.name || 'Seu lead'} respondeu seu SMS`,
        body: body.slice(0, 120),
        url: `/dashboard/whatsapp?lead=${lead.id}`,
        tag: `sms-reply-${lead.id}`,
      })
    } catch (e) { console.error('[Twilio SMS] push ao dono falhou:', (e as any)?.message) }
  }

  return twiml()
}
