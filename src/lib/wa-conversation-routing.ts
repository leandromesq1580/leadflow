/** Choose a conversation, never change the owner of the chosen lead. */
export type WhatsAppLeadCandidate = {
  id: string
  assigned_to: string | null
  assigned_to_member: string | null
  created_at: string | null
  assigned_at: string | null
  memberBuyerId: string | null
  ownerBuyerId: string | null
}

export type WhatsAppOutboundContext = {
  lead_id: string | null
  buyer_id: string
  from_phone: string | null
  sent_at: string
}

export function sameWhatsAppPhone(a: string | null | undefined, b: string | null | undefined) {
  const canonical = (value: string | null | undefined) => {
    const digits = String(value || '').replace(/\D/g, '')
    // North American numbers are sometimes stored without the country code.
    return digits.length === 10 ? `1${digits}` : digits
  }
  const left = canonical(a)
  return left.length >= 11 && left === canonical(b)
}

export function whatsappEventCutoff(timestamp: unknown, now = Date.now()) {
  const seconds = Number(timestamp)
  const event = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : now
  // whatsapp-web.js timestamps have second precision. Permit the app's insert
  // in that same second, but never use a future conversation to route backfill.
  return new Date(Math.min(event + 999, now + 999)).toISOString()
}

export function selectWhatsAppConversation<T extends WhatsAppLeadCandidate>(input: {
  candidates: T[]
  bridgeOwner: string
  bridgePhone: string
  recipientBuyerId: string | null
  ownerBridgePhones: ReadonlyMap<string, string | null>
  outbound: WhatsAppOutboundContext[]
  cutoff: string
}): T | null {
  // A phone match or an old message NEVER grants access to another account.
  const owned = input.candidates.filter(c => c.ownerBuyerId && (
    c.assigned_to === input.bridgeOwner || c.memberBuyerId === input.bridgeOwner
  ))
  const time = (value: string | null) => value ? Date.parse(value) || 0 : 0
  const ranked = owned.map(candidate => {
    const bridgeMatches = sameWhatsAppPhone(
      input.ownerBridgePhones.get(candidate.ownerBuyerId!), input.bridgePhone,
    )
    // Old incorrectly routed phone-origin messages must not reinforce the bug.
    // Only trust outbound context from the current owner's configured bridge.
    // Legacy CRM inserts have an empty from_phone, so use the verified owner
    // bridge in that case; a nonempty, different sender is never accepted.
    const lastOutbound = bridgeMatches ? Math.max(0, ...input.outbound.filter(m =>
      m.lead_id === candidate.id && m.buyer_id === candidate.ownerBuyerId &&
      (!m.from_phone || sameWhatsAppPhone(m.from_phone, input.bridgePhone)) &&
      time(m.sent_at) <= time(input.cutoff),
    ).map(m => time(m.sent_at))) : 0
    return { candidate, lastOutbound, bridgeMatches }
  })
  ranked.sort((a, b) =>
    b.lastOutbound - a.lastOutbound ||
    Number(b.bridgeMatches) - Number(a.bridgeMatches) ||
    Number(b.candidate.ownerBuyerId === input.recipientBuyerId) - Number(a.candidate.ownerBuyerId === input.recipientBuyerId) ||
    Number(!!b.candidate.memberBuyerId) - Number(!!a.candidate.memberBuyerId) ||
    time(b.candidate.assigned_at || b.candidate.created_at) - time(a.candidate.assigned_at || a.candidate.created_at) ||
    a.candidate.id.localeCompare(b.candidate.id),
  )
  return ranked[0]?.candidate || null
}
