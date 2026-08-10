import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/twilio'
import { pickCallerId, validVoiceSignature, VOICE_OUTBOUND_URL, VOICE_STATUS_URL, VOICE_WHISPER_URL, VOICE_RECORDING_URL, VOICE_TRANSCRIPTION_URL, xmlEscape } from '@/lib/voice'

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

  // TRANSCRIÇÃO AO VIVO (teste da Fase 2 do roteiro, 2026-08-08) — gated por conta em
  // settings.call_transcription.buyers. Fora da lista, NADA muda no TwiML. Desligar =
  // tirar o buyer da lista (sem deploy). O texto chega por webhook em quase tempo real;
  // consumimos "1 fork" do teto de 4 por chamada (AMD usa outro).
  let transcricao = ''
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'call_transcription').maybeSingle()
    const liberados: string[] = (data?.value as any)?.buyers || []
    if (params.buyerId && liberados.includes(params.buyerId)) {
      const tCb = `${VOICE_TRANSCRIPTION_URL}?buyer_id=${encodeURIComponent(params.buyerId)}&lead_id=${encodeURIComponent(params.leadId || '')}`
      transcricao =
        `<Start><Transcription statusCallbackUrl="${xmlEscape(tCb)}" languageCode="pt-BR" track="both_tracks" partialResults="false" transcriptionEngine="google"/></Start>`
    }
  } catch { /* transcrição é acessório: falha aqui nunca pode derrubar a ligação */ }

  // answerOnBridge: o navegador ouve o ringback e só conta minuto quando atende.
  const statusCb = `${VOICE_STATUS_URL}?buyer_id=${encodeURIComponent(params.buyerId || '')}&lead_id=${encodeURIComponent(params.leadId || '')}`
  const recCb = `${VOICE_RECORDING_URL}?buyer_id=${encodeURIComponent(params.buyerId || '')}&lead_id=${encodeURIComponent(params.leadId || '')}`
  const xml =
    `<Response>` +
    transcricao +
    // ringTone="us": com machineDetection o Twilio suprime o early media (tom de chamada
    // real da operadora) → sem isso o agente ouve SILÊNCIO até atender. O ringTone manda
    // o Twilio gerar o tom de chamada (padrão US) enquanto toca.
    // record="record-from-answer-dual" (2026-07-24, TODAS as ligações): grava do atendimento
    // em diante, 2 canais (agente|lead). O aviso de consentimento é o whisper no <Number>.
    `<Dial callerId="${xmlEscape(callerId)}" answerOnBridge="true" ringTone="us" record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackMethod="POST" action="${xmlEscape(statusCb)}" method="POST">` +
    // machineDetection="Enable" (AMD assíncrono): detecta humano × caixa postal SEM atrasar
    // o bridge do áudio; o resultado (AnsweredBy) chega no mesmo callback de status e
    // auto-classifica o follow-up da ligação. Custo Twilio ~$0.0075/chamada.
    // url=whisper: o LEAD ouve "This call may be recorded / Esta ligação pode ser gravada"
    // antes do bridge (consentimento two-party FL/MA/CA…); o agente não ouve o aviso.
    `<Number statusCallbackEvent="initiated ringing answered completed" statusCallback="${xmlEscape(statusCb)}" statusCallbackMethod="POST" machineDetection="Enable" amdStatusCallback="${xmlEscape(statusCb)}" amdStatusCallbackMethod="POST" url="${xmlEscape(VOICE_WHISPER_URL)}">${xmlEscape(target)}</Number>` +
    `</Dial>` +
    `</Response>`
  return twiml(xml)
}
