/** Display-only timezone. Never use this module to schedule jobs or rewrite stored timestamps. */
export const FLORIDA_TIME_ZONE = 'America/New_York'
export type DisplayDate = string | Date | number | null | undefined

function localeTag(locale: string): string {
  return ({ pt: 'pt-BR', en: 'en-US', es: 'es-US' } as Record<string, string>)[locale] || locale
}

export function formatFloridaDateTime(
  value: DisplayDate,
  locale = 'pt',
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
): string {
  if (value == null || value === '') return '—'
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
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
