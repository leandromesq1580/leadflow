import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/twilio'
import { pickCallerId, validVoiceSignature, VOICE_OUTBOUND_URL, VOICE_STATUS_URL, xmlEscape } from '@/lib/voice'

export const dynamic = 'force-dynamic'

function twiml(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

/**
 * POST /api/voice/outbound — TwiML que a TwiML App invoca quando o softphone
 * do navegador inicia uma chamada. Escolhe o caller ID LOCAL (mesmo DDD do lead)
 * e disca. Áudio flui pelo navegador (WebRTC).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>

  // Assinatura Twilio validada contra a URL CONFIGURADA na TwiML App (não a do request,
  // que o proxy da Vercel pode reescrever). Endpoint só devolve XML — não origina chamada
  // sozinho —, mas validamos mesmo assim.
  const sig = request.headers.get('x-twilio-signature')
  if (!validVoiceSignature(VOICE_OUTBOUND_URL, params, sig)) {
    console.warn('[voice/outbound] assinatura Twilio inválida')
    return twiml('<Response><Say>Chamada não autorizada.</Say><Hangup/></Response>')
  }

  const target = toE164(params.To)
  if (!target) {
    return twiml('<Response><Say>Número inválido.</Say><Hangup/></Response>')
  }

  const db = createAdminClient()
  const callerId = await pickCallerId(db, target)

  // answerOnBridge: o navegador ouve o ringback e só conta minuto quando atende.
  const statusCb = `${VOICE_STATUS_URL}?buyer_id=${encodeURIComponent(params.buyerId || '')}&lead_id=${encodeURIComponent(params.leadId || '')}`
  const xml =
    `<Response>` +
    `<Dial callerId="${xmlEscape(callerId)}" answerOnBridge="true" action="${xmlEscape(statusCb)}" method="POST">` +
    // machineDetection="Enable" (AMD assíncrono): detecta humano × caixa postal SEM atrasar
    // o bridge do áudio; o resultado (AnsweredBy) chega no mesmo callback de status e
    // auto-classifica o follow-up da ligação. Custo Twilio ~$0.0075/chamada.
    `<Number statusCallbackEvent="initiated ringing answered completed" statusCallback="${xmlEscape(statusCb)}" statusCallbackMethod="POST" machineDetection="Enable" amdStatusCallback="${xmlEscape(statusCb)}" amdStatusCallbackMethod="POST">${xmlEscape(target)}</Number>` +
    `</Dial>` +
    `</Response>`
  return twiml(xml)
}
