import crypto from 'crypto'
import { toE164 } from '@/lib/twilio'
import { AREA_CODE_TO_STATE, stateFromPhone } from '@/lib/us-area-codes'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Twilio Programmable Voice — softphone no navegador (Voice SDK) + local presence.
 *
 * Modelo: UMA conta Twilio, usuários ilimitados logados ligam pelo browser.
 * Sem seat: paga-se por minuto + números. O caller ID usa o estado do lead,
 * preferindo o mesmo DDD dentro do pool `voice_numbers`; sem match → cai no
 * TWILIO_FROM_NUMBER (o número 850 que já existe na conta).
 *
 * Env (Vercel + .env.local):
 *  TWILIO_ACCOUNT_SID       — ACxxxx (já existe, usado no SMS)
 *  TWILIO_API_KEY_SID       — SKxxxx (assina o AccessToken)
 *  TWILIO_API_KEY_SECRET    — segredo da API Key
 *  TWILIO_TWIML_APP_SID     — APxxxx (VoiceUrl → /api/voice/outbound)
 *  TWILIO_FROM_NUMBER       — +1850… (caller ID fallback do pool)
 */

function env(name: string): string {
  return (process.env[name] || '').trim().replace(/\\n/g, '')
}

export function voiceConfigured(): boolean {
  return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_API_KEY_SID') && env('TWILIO_API_KEY_SECRET') && env('TWILIO_TWIML_APP_SID'))
}

/** URL pública que a TwiML App chama (usada TAMBÉM pra validar a assinatura Twilio). */
export const VOICE_OUTBOUND_URL = 'https://lead4producers.com/api/voice/outbound'
export const VOICE_STATUS_URL = 'https://lead4producers.com/api/voice/status'
// Aviso de consentimento tocado SÓ pro lead antes do bridge (leis two-party: FL, MA, CA…)
export const VOICE_WHISPER_URL = 'https://lead4producers.com/api/voice/whisper'
export const VOICE_TRANSCRIPTION_URL = 'https://lead4producers.com/api/voice/transcription'
// Callback quando a gravação fica pronta (baixa do Twilio → Storage privado → Anexos)
export const VOICE_RECORDING_URL = 'https://lead4producers.com/api/voice/recording'

/** Extrai o DDD (area code) de um telefone US. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  const e = toE164(phone)
  if (!e) return null
  const d = e.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : (d.length === 10 ? d : null)
  return ten ? ten.slice(0, 3) : null
}

type VoiceNumber = { phone_number: string; area_code: string; state: string | null }
const US_STATE_CODES = new Set(Object.values(AREA_CODE_TO_STATE))

function stateCode(value: string | null | undefined): string | null {
  const code = (value || '').trim().toUpperCase()
  return US_STATE_CODES.has(code) ? code : null
}

/** Pure selection: saved lead state wins over a phone's original area code. */
export function selectVoiceCallerId(
  numbers: VoiceNumber[],
  leadPhone: string | null | undefined,
  leadState: string | null | undefined,
  fallback: string,
): string {
  const ac = areaCodeOf(leadPhone)
  if (!ac) return fallback
  const state = stateCode(leadState) || stateFromPhone(leadPhone)
  // Never turn an invalid pool value into an outbound caller ID.
  const valid = numbers.filter(n => /^\+1[2-9]\d{9}$/.test(n.phone_number))
  const candidates = state
    ? valid.filter(n => (stateCode(n.state) || stateFromPhone(n.phone_number)) === state)
    : valid.filter(n => n.area_code === ac)
  return candidates.find(n => n.area_code === ac)?.phone_number
    || candidates[0]?.phone_number || fallback
}

/**
 * Use the saved state only when the lead ID refers to the number being dialed.
 * Otherwise infer the state from the phone. Empty/unavailable pool keeps the
 * existing default number; database failures must not interrupt calls.
 */
export async function pickCallerId(db: Db, leadPhone: string | null | undefined, leadId?: string): Promise<string> {
  const fallback = env('TWILIO_FROM_NUMBER')
  if (!areaCodeOf(leadPhone)) return fallback
  let leadState: string | null = null
  if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
    try {
      const { data, error } = await db.from('leads').select('state, phone').eq('id', leadId).maybeSingle()
      if (!error && data && toE164(data.phone) === toE164(leadPhone)) leadState = data.state
    } catch { /* missing lead context: infer state from phone */ }
  }
  try {
    const { data, error } = await db.from('voice_numbers')
      .select('phone_number, area_code, state').order('created_at', { ascending: true })
    if (!error && data) return selectVoiceCallerId(data, leadPhone, leadState, fallback)
  } catch {
    // tabela ainda não migrada → usa fallback
  }
  return fallback
}

// ---- AccessToken JWT (assinado na mão, HS256 com o API Key Secret) ----

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Gera um Twilio AccessToken com VoiceGrant (outgoing = nossa TwiML App).
 * `identity` = id do buyer logado (atribui as chamadas a ele).
 */
export function createVoiceAccessToken(identity: string, ttlSec = 3600): string {
  const accountSid = env('TWILIO_ACCOUNT_SID')
  const keySid = env('TWILIO_API_KEY_SID')
  const keySecret = env('TWILIO_API_KEY_SECRET')
  const appSid = env('TWILIO_TWIML_APP_SID')
  const now = Math.floor(Date.now() / 1000)

  const header = { cty: 'twilio-fpa;v=1', typ: 'JWT', alg: 'HS256' }
  const payload = {
    jti: `${keySid}-${now}`,
    iss: keySid,
    sub: accountSid,
    iat: now,
    nbf: now,
    exp: now + ttlSec,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: appSid },
      },
    },
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac('sha256', keySecret).update(signingInput).digest()
  return `${signingInput}.${b64url(sig)}`
}

/** Valida a assinatura X-Twilio-Signature contra a URL configurada (não a do request). */
export function validVoiceSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
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

/** XML helper — escapa atributos do TwiML. */
export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
