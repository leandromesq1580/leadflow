import { parsePhoneNumberFromString, getCountries, type CountryCode } from 'libphonenumber-js/max'

export type BookingField = 'nome' | 'email' | 'telefone' | 'slot'
export class BookingValidationError extends Error {
  constructor(public field: BookingField) { super('invalid') }
}

export function normalizeBookingPhone(value: string, country: unknown = 'US') {
  if (typeof country !== 'string' || !getCountries().includes(country as CountryCode)) throw Error('invalid')
  if (!/^\+?[\d\s().-]+$/.test(value.trim())) throw Error('invalid')
  const phone = parsePhoneNumberFromString(value.trim(), country as CountryCode)
  if (!phone?.isValid()) throw Error('invalid')
  return phone.number
}

// Same sales calendar/grid as /nova; recruitment has its own source and atomic write.
export const SALES_EMAIL = 'regiane@myhomefirst.us'
export const TEAM_ZONE = 'America/Sao_Paulo'
const HALF_HOUR = 30 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
export const LOCALES = { en: 'en-US', pt: 'pt-BR', es: 'es-US' }
export type BookingLang = keyof typeof LOCALES

export function slotLabel(slot: string, lang: BookingLang, zone: string) {
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(slot))
}

export function availableSlots(now: Date, occupied: string[] = []): string[] {
  const slots: string[] = []
  const busy = occupied.map(s => new Date(s).getTime())
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  // Generate UTC instants first, then inspect team civil time. Never apply the
  // visitor's offset to a team date (DST and date-line changes remain correct).
  for (let time = Math.ceil((now.getTime() + 4 * 3600000) / HALF_HOUR) * HALF_HOUR; time <= now.getTime() + 30 * DAY; time += HALF_HOUR) {
    const p = fmt.formatToParts(new Date(time))
    const get = (type: string) => p.find(x => x.type === type)?.value || ''
    const hour = Number(get('hour'))
    if (['Sat', 'Sun'].includes(get('weekday')) || !((hour >= 9 && hour < 12) || (hour >= 13 && hour < 17))) continue
    if (busy.some(b => Math.abs(b - time) < HALF_HOUR)) continue
    slots.push(new Date(time).toISOString())
  }
  return slots
}

export function validateBooking(value: unknown, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid')
  const b = value as Record<string, unknown>
  const str = (key: string, max: number) => {
    if (typeof b[key] !== 'string' || (b[key] as string).length > max) {
      if (['nome','email','telefone','slot'].includes(key)) throw new BookingValidationError(key as BookingField)
      throw Error('invalid')
    }
    return (b[key] as string).trim()
  }
  const nome = str('nome', 120), email = str('email', 254).toLowerCase()
  if (nome.length < 2 || /[\x00-\x1f]/.test(nome)) throw new BookingValidationError('nome')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingValidationError('email')
  let telefone: string
  try { telefone = normalizeBookingPhone(str('telefone', 40), b.country ?? 'US') }
  catch { throw new BookingValidationError('telefone') }
  const idioma = str('idioma', 2) as BookingLang, fuso = str('fuso', 80), slot = str('slot', 30), requestId = str('requestId', 36)
  if (!Object.hasOwn(LOCALES, idioma) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId) || b.website !== '') throw Error('invalid')
  new Intl.DateTimeFormat('en-US', { timeZone: fuso }).format(now)
  if (!availableSlots(now).includes(slot)) throw new BookingValidationError('slot')
  const tracking: Record<string, string> = {}
  const supplied = b.tracking as Record<string, unknown> | undefined
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id']) {
    if (supplied && typeof supplied[key] === 'string') tracking[key] = supplied[key].slice(0, 200)
  }
  return { nome, email, telefone, idioma, fuso, slot, requestId, tracking }
}
