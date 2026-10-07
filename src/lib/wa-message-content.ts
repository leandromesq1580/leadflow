type WhatsAppContent = {
  body?: unknown
  media_type?: unknown
  media_url?: unknown
}

type WhatsAppEvent = WhatsAppContent & {
  type?: unknown
  has_media?: unknown
  direction?: unknown
  wa_message_id?: unknown
}

const TECHNICAL_TYPES = new Set([
  'e2e_notification', 'ciphertext', 'notification_template', 'gp2',
  'protocol', 'revoked', 'call_log', 'notification', 'broadcast_notification',
])

const MEDIA_TYPES = new Set([
  'audio', 'ptt', 'image', 'video', 'document', 'sticker',
  'location', 'vcard', 'multi_vcard',
])

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** A media type alone is enough: downloads may fail or still be pending. */
export function hasWhatsAppContent(row: WhatsAppContent): boolean {
  return nonblank(row.body) || nonblank(row.media_type) || nonblank(row.media_url)
}

/** Preserve content types (including contacts/location) when no file is downloadable. */
export function whatsAppMediaType(payload: WhatsAppEvent): string | null {
  if (nonblank(payload.media_type)) return payload.media_type
  if (typeof payload.type === 'string' && MEDIA_TYPES.has(payload.type)) return payload.type
  return payload.has_media === true ? 'media' : null
}

function isOwnMessageId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('true_')
}

export function isCustomerReply(row: WhatsAppContent & { direction?: unknown; wa_message_id?: unknown }): boolean {
  return row.direction === 'in' && hasWhatsAppContent(row) && !isOwnMessageId(row.wa_message_id)
}

/** Transport notifications are not messages, even when they contain a body. */
export function shouldIgnoreWhatsAppEvent(payload: WhatsAppEvent): boolean {
  if (typeof payload.type === 'string' && TECHNICAL_TYPES.has(payload.type)) return true
  // The route defaults to inbound. Ignore conflicting own echoes rather than
  // inventing a direction/peer and interrupting the customer's automation.
  if (payload.direction !== 'out' && isOwnMessageId(payload.wa_message_id)) return true

  return !hasWhatsAppContent(payload)
    && payload.has_media !== true
    && !(typeof payload.type === 'string' && MEDIA_TYPES.has(payload.type))
}
