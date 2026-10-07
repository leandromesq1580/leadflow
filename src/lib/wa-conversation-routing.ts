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

/** Exact digit aliases, not suffix matching. Brazil aliases require an explicit
 * country code, a valid DDD and a plausible legacy mobile (6–9 + seven digits).
 * Only the ninth digit immediately after the DDD may be added/removed.
 * Ten-digit NANP storage remains supported; Brazilian national-only input is
 * intentionally not guessed because its country is ambiguous.
 */
export function whatsAppPhoneVariants(value: string | null | undefined): string[] {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return []
  const variants = [digits]
  if (digits.length === 10) variants.push(`1${digits}`)
  else if (/^1\d{10}$/.test(digits)) variants.push(digits.slice(1))
  const brazil = digits.match(/^55(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])(9?[6-9]\d{7})$/)
  if (brazil) {
    const [, ddd, mobile] = brazil
    variants.push(`55${ddd}${mobile.length === 9 ? mobile.slice(1) : `9${mobile}`}`)
  }
  return variants
}

/** Text phone columns are written as digits, sometimes with a leading '+'. */
export function whatsAppStoredPhoneVariants(value: string | null | undefined): string[] {
  return whatsAppPhoneVariants(value).flatMap(phone => [phone, `+${phone}`])
}

export function sameWhatsAppPhone(a: string | null | undefined, b: string | null | undefined) {
  const left = whatsAppPhoneVariants(a)
  const right = whatsAppPhoneVariants(b)
  return left.some(phone => phone.length >= 11 && right.includes(phone))
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
