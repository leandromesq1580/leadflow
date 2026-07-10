import crypto from 'crypto'
import { toE164 } from '@/lib/twilio'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Twilio Programmable Voice — softphone no navegador (Voice SDK) + local presence.
 *
 * Modelo: UMA conta Twilio, usuários ilimitados logados ligam pelo browser.
 * Sem seat: paga-se por minuto + números. O caller ID casa com o DDD do lead
 * (local presence) escolhendo do pool `voice_numbers`; sem match → cai no
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

/** Extrai o DDD (area code) de um telefone US. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  const e = toE164(phone)
  if (!e) return null
  const d = e.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : (d.length === 10 ? d : null)
  return ten ? ten.slice(0, 3) : null
}

/**
 * Escolhe o caller ID local pro lead: número do pool com o MESMO DDD; se não
 * houver (pool ainda vazio ou DDD sem número), cai no TWILIO_FROM_NUMBER.
 * Tolerante à tabela `voice_numbers` não existir ainda (retorna o fallback).
 */
export async function pickCallerId(db: Db, leadPhone: string | null | undefined): Promise<string> {
  const fallback = env('TWILIO_FROM_NUMBER')
  const ac = areaCodeOf(leadPhone)
  if (!ac) return fallback
  try {
    const { data } = await db.from('voice_numbers').select('phone_number').eq('area_code', ac).limit(1).maybeSingle()
    if (data?.phone_number) return data.phone_number
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
