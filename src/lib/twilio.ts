import crypto from 'crypto'

/**
 * Integração Twilio SMS — REST direto (sem SDK, payloads simples demais pra
 * justificar dependência). Envio via Messages API + validação de assinatura
 * do webhook inbound.
 *
 * Env (Vercel + .env.local):
 *  TWILIO_ACCOUNT_SID   — ACxxxxxxxx
 *  TWILIO_AUTH_TOKEN    — token da conta
 *  TWILIO_FROM_NUMBER   — número comprado, E.164 (+1XXXXXXXXXX)
 *  TWILIO_MESSAGING_SERVICE_SID — (opcional) MGxxxx; se setado, tem prioridade
 *    sobre o FROM (melhor pra A2P/volume — a Twilio gerencia fila e opt-out)
 */

function env(name: string): string {
  return (process.env[name] || '').trim().replace(/\\n/g, '')
}

export function twilioConfigured(): boolean {
  return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && (env('TWILIO_FROM_NUMBER') || env('TWILIO_MESSAGING_SERVICE_SID')))
}

/** Normaliza pra E.164 (+1...). Leads US: 10 dígitos ganham +1. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  return null
}

/** Substitui variáveis no corpo: {nome} (primeiro nome), {nome_completo}, {estado}. */
export function renderSmsBody(template: string, lead: { name?: string | null; state?: string | null }): string {
  const first = (lead.name || '').trim().split(/\s+/)[0] || ''
  return template
    .replaceAll('{nome}', first)
    .replaceAll('{nome_completo}', (lead.name || '').trim())
    .replaceAll('{estado}', lead.state || '')
}

/** Segmentos SMS (aprox): GSM-7 = 160 (1 seg) ou 153/seg concatenado; unicode (emoji/ç…) = 70 ou 67/seg. */
export function smsSegments(body: string): number {
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(body)
  const len = body.length
  if (len === 0) return 1
  if (gsm) return len <= 160 ? 1 : Math.ceil(len / 153)
  return len <= 70 ? 1 : Math.ceil(len / 67)
}

export interface SmsSendResult { ok: boolean; sid?: string; error?: string }

/** Envia 1 SMS via Twilio Messages API. */
export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_FROM_NUMBER')
  const mss = env('TWILIO_MESSAGING_SERVICE_SID')
  if (!sid || !token || (!from && !mss)) return { ok: false, error: 'Twilio não configurado (env)' }

  const form = new URLSearchParams({ To: to, Body: body })
  if (mss) form.set('MessagingServiceSid', mss)
  else form.set('From', from)

  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const d: any = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: d?.message || `Twilio HTTP ${r.status}` }
    return { ok: true, sid: d?.sid }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch failed' }
  }
}

/**
 * Valida a assinatura X-Twilio-Signature do webhook (HMAC-SHA1 do url + params
 * ordenados, chaveado pelo Auth Token). Sem token configurado → rejeita.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = env('TWILIO_AUTH_TOKEN')
  if (!token || !signature) return false
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

/** Palavras de opt-out (inglês + português, por garantia). */
export function isOptOut(body: string): boolean {
  const t = body.trim().toUpperCase()
  return ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'PARE', 'PARAR', 'SAIR'].includes(t)
}
