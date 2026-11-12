import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { COMPANY_WHATSAPP_PHONE, isCloudMessageId, normalizeCloudRecipient } from './wa-cloud'

type Sender = { wabaId: string; phoneNumberId: string }
type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'
type InboundContent = { body: string; subscribed: boolean | null }

export type WhatsAppCloudEvent =
  | ({ type: 'inbound'; phone: string; messageId: string; eventAt: string; replyTo: string | null } & InboundContent)
  | { type: 'status'; phone: string; messageId: string; operationId: string | null; status: DeliveryStatus }

const OPT_IN = new Set(['ACEITO RECEBER MENSAGENS', 'I AGREE TO RECEIVE MESSAGES', 'ACEPTO RECIBIR MENSAJES'])
const OPT_OUT = new Set([
  'STOP', 'STOPALL', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE', 'STOP_MESSAGES', 'STOP_ALERTS',
  'PARAR', 'PARE', 'SAIR', 'CANCELAR', 'PARAR MENSAGENS', 'DESATIVAR AVISOS',
  'BAJA', 'NO ME CONTACTE', 'DEJAR DE RECIBIR MENSAJES', 'DESACTIVAR AVISOS',
])
const ATTACHMENT_LABELS = new Map([
  ['audio', '[Áudio]'], ['document', '[Documento]'], ['image', '[Imagem]'],
  ['sticker', '[Figurinha]'], ['video', '[Vídeo]'],
])
const OPERATION_ID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

export function whatsappCloudChallenge(params: URLSearchParams, verifyToken: string): string | null {
  const suppliedToken = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (params.get('hub.mode') !== 'subscribe' || !suppliedToken || !challenge || !verifyToken) return null

  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(suppliedToken), digest(verifyToken)) ? challenge : null
}

export function verifyWhatsAppCloudSignature(raw: Uint8Array, signature: string | null, appSecret: string): boolean {
  const suppliedDigest = signature?.match(/^sha256=([\da-f]{64})$/i)?.[1]
  if (!suppliedDigest || !appSecret) return false
  const expected = createHmac('sha256', appSecret).update(raw).digest()
  return timingSafeEqual(Buffer.from(suppliedDigest, 'hex'), expected)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim()
}

function phoneNumber(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[1-9]\d{7,14}$/.test(value)) return null
  return normalizeCloudRecipient(`+${value}`)
}

function eventTime(value: unknown): string | null {
  const seconds = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 253402300799) return null
  return new Date(seconds * 1000).toISOString()
}

function isOptOut(value: unknown): boolean {
  return nonblank(value) && OPT_OUT.has(value.trim().replace(/[.!]+$/, '').trimEnd().toUpperCase())
}

function sanitizeBody(value: string): string {
  const wellFormed = Buffer.from(value, 'utf8').toString('utf8').replaceAll('\0', '').trim()
  return Array.from(wellFormed).slice(0, 4096).join('')
}

function selectionReply(label: unknown, id: unknown): InboundContent | null {
  const body = nonblank(label) ? sanitizeBody(label) : ''
  if (!body && !nonblank(id)) return null
  return { body: body || '[Resposta rápida]', subscribed: isOptOut(body) || isOptOut(id) ? false : null }
}

function inboundContent(message: Record<string, unknown>): InboundContent | null {
  if (message.type === 'text') {
    const text = record(message.text).body
    const body = nonblank(text) ? sanitizeBody(text) : ''
    if (!body) return null
    return { body, subscribed: OPT_IN.has(body.toUpperCase()) ? true : isOptOut(body) ? false : null }
  }
  if (message.type === 'button') {
    const { text, payload } = record(message.button)
    return selectionReply(text, payload)
  }
  if (message.type === 'interactive') {
    const interactive = record(message.interactive)
    if (interactive.type === 'button_reply' || interactive.type === 'list_reply') {
      const { id, title } = record(interactive[interactive.type])
      return selectionReply(title, id)
    }
    if (interactive.type === 'nfm_reply' && nonblank(record(interactive.nfm_reply).response_json)) {
      return { body: '[Resposta ao formulário]', subscribed: null }
    }
  }
  if (typeof message.type !== 'string') return null
  const attachment = ATTACHMENT_LABELS.get(message.type)
  if (attachment && nonblank(record(message[message.type]).id)) return { body: attachment, subscribed: null }
  if (message.type === 'contacts' && items(message.contacts).length) return { body: '[Contato]', subscribed: null }
  if (message.type === 'location') {
    const { latitude, longitude } = record(message.location)
    if (typeof latitude === 'number' && Number.isFinite(latitude) &&
      typeof longitude === 'number' && Number.isFinite(longitude)) return { body: '[Localização]', subscribed: null }
  }
  return null
}

function deliveryStatus(value: unknown): value is DeliveryStatus {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed'
}

/** Keep only customer events and delivery receipts for the configured WhatsApp account. */
export function parseWhatsAppCloudEvents(payload: unknown, sender: Sender): WhatsAppCloudEvent[] {
  const root = record(payload)
  if (root.object !== 'whatsapp_business_account') return []

  const events: WhatsAppCloudEvent[] = []
  for (const entryValue of items(root.entry)) {
    const entry = record(entryValue)
    if (entry.id !== sender.wabaId) continue
    for (const changeValue of items(entry.changes)) {
      const change = record(changeValue)
      const value = record(change.value)
      const metadata = record(value.metadata)
      const displayPhone = typeof metadata.display_phone_number === 'string'
        ? normalizeCloudRecipient(metadata.display_phone_number) : null
      if (change.field !== 'messages' || value.messaging_product !== 'whatsapp' ||
        metadata.phone_number_id !== sender.phoneNumberId || displayPhone !== COMPANY_WHATSAPP_PHONE) continue

      for (const messageValue of items(value.messages)) {
        const message = record(messageValue)
        const phone = phoneNumber(message.from)
        const eventAt = eventTime(message.timestamp)
        if (!phone || phone === COMPANY_WHATSAPP_PHONE || !eventAt || !isCloudMessageId(message.id)) continue

        const content = inboundContent(message)
        if (!content) continue
        const quotedId = record(message.context).id
        const replyTo = isCloudMessageId(quotedId) ? quotedId : null
        events.push({ type: 'inbound', phone, messageId: message.id, eventAt, replyTo, ...content })
      }
      for (const statusValue of items(value.statuses)) {
        const { recipient_id, id, biz_opaque_callback_data, status } = record(statusValue)
        const phone = phoneNumber(recipient_id)
        const operationId = biz_opaque_callback_data ?? null
        if (!phone || !isCloudMessageId(id) || !deliveryStatus(status)) continue
        if (operationId !== null && (typeof operationId !== 'string' || !OPERATION_ID.test(operationId))) continue

        events.push({ type: 'status', phone, messageId: id, operationId, status })
      }
    }
  }
  return events
}
