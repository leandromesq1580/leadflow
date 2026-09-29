export interface AISequenceConfig {
  goal: 'call' | 'meeting'
  brief: string
  initial_delay_minutes: number
  repeat_minutes: number
  timezone: string
  days: number[]
  start: string
  end: string
  stop_on_stage_exit: boolean
  booking_url: string
}
export const defaultAIConfig: AISequenceConfig = {
  goal: 'call', brief: '', initial_delay_minutes: 60, repeat_minutes: 1440,
  timezone: 'America/New_York', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00',
  stop_on_stage_exit: true, booking_url: '',
}
export function validateAIConfig(value: unknown): AISequenceConfig {
  const c = value as AISequenceConfig
  const fail = () => { throw new Error('Configuração IA inválida: confira objetivo, intervalos, dias, fuso e janela.') }
  if (!c || !['call', 'meeting'].includes(c.goal) || typeof c.brief !== 'string' || c.brief.length > 300 ||
    !Number.isInteger(c.initial_delay_minutes) || c.initial_delay_minutes < 0 || c.initial_delay_minutes > 43200 ||
    !Number.isInteger(c.repeat_minutes) || c.repeat_minutes < 60 || c.repeat_minutes > 43200 ||
    !Array.isArray(c.days) || !c.days.length || c.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
    typeof c.stop_on_stage_exit !== 'boolean' || typeof c.timezone !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end) || c.start >= c.end ||
    typeof c.booking_url !== 'string') fail()
  try { new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format() } catch { fail() }
  if (c.booking_url) {
    try {
      const u = new URL(c.booking_url)
      // Explicit public HTTPS URL only; never fetched server-side. No credentials, IPs or local domains.
      if (c.booking_url.length > 250 || /[\s<>"'`\\]/.test(c.booking_url) || u.protocol !== 'https:' || u.username || u.password || u.port ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) || /\.(local|internal|localhost)$/i.test(u.hostname)) fail()
    } catch { fail() }
  }
  return { goal: c.goal, brief: c.brief, initial_delay_minutes: c.initial_delay_minutes, repeat_minutes: c.repeat_minutes,
    timezone: c.timezone, days: c.days, start: c.start, end: c.end, stop_on_stage_exit: c.stop_on_stage_exit, booking_url: c.booking_url }
}
/** Walk UTC minutes, rather than constructing nonexistent/ambiguous DST wall times. Window end is exclusive. */
export function nextSendAt(after: Date, config: AISequenceConfig | unknown): Date {
  const c = validateAIConfig(config)
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: c.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (let time = after.getTime(), n = 0; n < 11520; n++, time = Math.floor(time / 60000) * 60000 + 60000) {
    const parts = Object.fromEntries(fmt.formatToParts(time).map(p => [p.type, p.value]))
    const clock = `${parts.hour}:${parts.minute}`
    if (c.days.includes(weekdays.indexOf(parts.weekday)) && clock >= c.start && clock < c.end) return new Date(time)
  }
  throw new Error('Janela de envio indisponível')
}
