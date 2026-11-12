import { OFFICIAL_WHATSAPP_NUMBER } from './official-whatsapp'

export type WhatsAppCloudConfig = {
  phoneNumberId: string
  wabaId: string
  graphVersion: string
  accessToken: string
  appSecret: string
  verifyToken: string
}

type CloudTemplate = { to: string; name: string; language: string; operationId: string }
type CloudText = { to: string; body: string; operationId: string }
type CloudMessage =
  | { type: 'template'; template: { name: string; language: { code: string } } }
  | { type: 'text'; text: { body: string } }
type CloudSendResult =
  | { kind: 'accepted'; messageId: string }
  | { kind: 'rejected'; code: number | null }
  | { kind: 'unknown'; code: number | null }
type CloudEnv = Readonly<Record<string, string | undefined>>

export function cloudAutomationEnabled(env: CloudEnv = process.env): boolean {
  return env.WA_CLOUD_AUTOMATION_ENABLED === 'true'
}

export function getWhatsAppCloudConfig(env: CloudEnv = process.env): WhatsAppCloudConfig | null {
  const phoneNumberId = env.WA_CLOUD_PHONE_NUMBER_ID?.trim()
  const wabaId = env.WA_CLOUD_WABA_ID?.trim()
  const graphVersion = env.WA_CLOUD_GRAPH_VERSION?.trim()
  const accessToken = env.WA_CLOUD_ACCESS_TOKEN?.trim()
  const appSecret = env.WA_CLOUD_APP_SECRET?.trim()
  const verifyToken = env.WA_CLOUD_VERIFY_TOKEN?.trim()

  if (!phoneNumberId || !/^[1-9]\d*$/.test(phoneNumberId)) return null
  if (!wabaId || !/^[1-9]\d*$/.test(wabaId)) return null
  if (!graphVersion || !/^v[1-9]\d\.\d$/.test(graphVersion)) return null
  if (!accessToken || /[\r\n]/.test(accessToken) || !appSecret || !verifyToken) return null

  return { phoneNumberId, wabaId, graphVersion, accessToken, appSecret, verifyToken }
}

export function normalizeCloudRecipient(value: string): string | null {
  const phone = value.trim()
  if (phone.length > 40 || !/^\+?(?:\d+[ .-]*)?(?:\(\d+\)[ .-]*)?\d+(?:[ .-]+\d+)*$/.test(phone)) return null

  const digits = phone.replace(/\D/g, '')
  if (!phone.startsWith('+') && digits.length === 10) return /^[2-9]\d{9}$/.test(digits) ? `1${digits}` : null
  if (!phone.startsWith('+') && digits.length < 11) return null
  if (!/^[1-9]\d{7,14}$/.test(digits) || (digits.startsWith('1') && digits.length !== 11)) return null
  return digits
}

export const COMPANY_WHATSAPP_PHONE = OFFICIAL_WHATSAPP_NUMBER
const GRAPH_URL = 'https://graph.facebook.com'

export function isCloudMessageId(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && /^wamid\.[A-Za-z0-9+/_=-]{1,506}$/.test(value)
}

function bridgeUrl(value: string | null | undefined): URL | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim().replace(/\/+$/, ''))
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

export function isCompanyWhatsAppSender(
  sender: { url?: string | null; phone?: string | null },
  env: CloudEnv = process.env,
): boolean {
  if (sender.phone && normalizeCloudRecipient(sender.phone) === COMPANY_WHATSAPP_PHONE) return true

  const url = bridgeUrl(sender.url)
  if (!url) return false
  // These are two addresses for the same sender, including when the cached
  // bridge phone is stale or the bridge is disconnected.
  if (url.hostname === '62.146.229.13' && (url.port === '3456' || url.port === '3457') && url.pathname === '/') return true
  return url.href === bridgeUrl(env.WA_CLOUD_LEGACY_BRIDGE_URL)?.href
}

export async function verifyCompanyCloudPhone(config: WhatsAppCloudConfig, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${GRAPH_URL}/${config.graphVersion}/${config.phoneNumberId}?fields=display_phone_number`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.accessToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return false

    const payload = await response.json()
    return payload?.id === config.phoneNumberId
      && typeof payload.display_phone_number === 'string'
      && normalizeCloudRecipient(payload.display_phone_number) === COMPANY_WHATSAPP_PHONE
  } catch {
    return false
  }
}

// The Graph error code plus HTTP 400 identifies a documented input/template
// validation failure. Other responses cannot establish that Meta declined it.
const validationCodes = new Set([
  100, // Invalid parameter
  131008, // Required parameter missing
  131009, // Parameter value invalid
  132000, // Template parameter count mismatch
  132001, // Template or translation unavailable
  132005, // Template text too long
  132007, // Template format violates policy
  132012, // Template parameter format mismatch
  132015, // Template paused
  132016, // Template disabled
])

export async function sendCloudTemplate(
  config: WhatsAppCloudConfig,
  { to, name, language, operationId }: CloudTemplate,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudSendResult> {
  if (name !== name.trim() || language !== language.trim()
    || !/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    return { kind: 'rejected', code: null }
  }
  return sendCloudMessage(config, to, operationId, { type: 'template', template: { name, language: { code: language } } }, fetchImpl)
}

export async function sendCloudText(
  config: WhatsAppCloudConfig,
  { to, body, operationId }: CloudText,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudSendResult> {
  if (!body.trim() || Array.from(body).length > 4096) return { kind: 'rejected', code: null }
  return sendCloudMessage(config, to, operationId, { type: 'text', text: { body } }, fetchImpl)
}

async function sendCloudMessage(
  config: WhatsAppCloudConfig,
  to: string,
  operationId: string,
  message: CloudMessage,
  fetchImpl: typeof fetch,
): Promise<CloudSendResult> {
  // Dispatch plans supply country-qualified digits. Keep that interpretation
  // when their international number has the same length as a national NANP number.
  const recipient = normalizeCloudRecipient(/^\d+$/.test(to) ? `+${to}` : to)
  if (!recipient || operationId !== operationId.trim() || !/^[\x21-\x7e]{1,512}$/.test(operationId)) {
    return { kind: 'rejected', code: null }
  }

  try {
    const response = await fetchImpl(`${GRAPH_URL}/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        biz_opaque_callback_data: operationId,
        ...message,
      }),
    })
    const payload = await response.json()
    const code = Number.isInteger(payload?.error?.code) ? payload.error.code as number : null
    const messages = payload?.messages
    const messageId = Array.isArray(messages) && messages.length === 1 ? messages[0]?.id : null

    if (response.ok && !payload?.error && isCloudMessageId(messageId)) {
      return { kind: 'accepted', messageId }
    }
    if (response.status === 400 && messages === undefined && payload?.error?.is_transient !== true && code !== null && validationCodes.has(code)) {
      return { kind: 'rejected', code }
    }
    return { kind: 'unknown', code }
  } catch {
    return { kind: 'unknown', code: null }
  }
}
