/** Display-only timezone. Never use this module to schedule jobs or rewrite stored timestamps. */
export const FLORIDA_TIME_ZONE = 'America/New_York'
export type DisplayDate = string | Date | number | null | undefined

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function localeTag(locale: string): string {
  return ({ pt: 'pt-BR', en: 'en-US', es: 'es-US' } as Record<string, string>)[locale] || locale
}

export function formatFloridaDateTime(
  value: DisplayDate,
  locale = 'pt',
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
): string {
  if (value == null || value === '') return '—'
  const dateOnly = typeof value === 'string' && DAY_ONLY.test(value)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  if (dateOnly) {
    if (date.toISOString().slice(0, 10) !== value) return '—'
    // A calendar date is not an instant; remove time fields and retain its literal day.
    const dateOptions = { ...options }
    for (const key of ['hour', 'minute', 'second', 'fractionalSecondDigits', 'dayPeriod', 'timeStyle', 'timeZoneName'] as const) delete dateOptions[key]
    return new Intl.DateTimeFormat(localeTag(locale), { ...dateOptions, timeZone: 'UTC' }).format(date)
  }
  return new Intl.DateTimeFormat(localeTag(locale), { ...options, timeZone: FLORIDA_TIME_ZONE }).format(date)
}

/**
 * Florida wall clock of an instant, as form-ready parts: { date: 'YYYY-MM-DD', time: 'HH:mm' }.
 * Independent of the browser/server timezone. A calendar-only string keeps its literal day.
 */
export function floridaParts(value: DisplayDate): { date: string; time: string } {
  if (value == null || value === '') return { date: '', time: '' }
  if (typeof value === 'string' && DAY_ONLY.test(value)) return { date: value, time: '00:00' }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: FLORIDA_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` }
}

/** Today's Florida calendar day ('YYYY-MM-DD'). */
export function floridaToday(now: Date = new Date()): string {
  return floridaParts(now).date
}

/** Adds whole days to a 'YYYY-MM-DD' string (pure calendar arithmetic, no timezone involved). */
export function addFloridaDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Converts a Florida wall-clock choice (the date/time a user typed in a form) to the UTC instant.
 * DST-safe: a time inside the spring-forward gap rolls forward; a repeated fall-back time picks the
 * first (daylight) occurrence. Returns '' for malformed input so callers can validate.
 */
export function floridaWallClockToISO(date: string, time = '00:00'): string {
  if (!DAY_ONLY.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return ''
  const wanted = Date.parse(`${date}T${time.slice(0, 5)}:00Z`)
  if (!Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0, 10) !== date) return ''
  let guess = wanted
  // Iterate: measure how far the Florida wall clock of the guess is from the wanted wall clock.
  for (let i = 0; i < 3; i++) {
    const p = floridaParts(new Date(guess))
    const shown = Date.parse(`${p.date}T${p.time}:00Z`)
    const diff = wanted - shown
    if (diff === 0) break
    guess += diff
  }
  // Inside a spring-forward gap the loop oscillates; settle on the instant just after the gap.
  const p = floridaParts(new Date(guess))
  if (Date.parse(`${p.date}T${p.time}:00Z`) !== wanted) {
    const before = guess - 3_600_000
    const q = floridaParts(new Date(before))
    guess = Date.parse(`${q.date}T${q.time}:00Z`) < wanted ? guess : before
  }
  // Fall-back overlap: two instants show the same wall clock; keep the earlier (daylight) one.
  const earlier = guess - 3_600_000
  const e = floridaParts(new Date(earlier))
  if (Date.parse(`${e.date}T${e.time}:00Z`) === wanted) guess = earlier
  return new Date(guess).toISOString()
}

/**
 * UTC bounds of `days` Florida calendar days starting at `date`: from midnight (inclusive) to the
 * midnight after the last day (exclusive). Query with gte(fromIso) and lt(toIso).
 */
export function floridaDayRange(date: string, days = 1): { fromIso: string; toIso: string } {
  return { fromIso: floridaWallClockToISO(date, '00:00'), toIso: floridaWallClockToISO(addFloridaDays(date, days), '00:00') }
}
