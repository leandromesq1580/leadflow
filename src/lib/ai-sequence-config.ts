import { AI_SEQUENCE_MODELS, DEFAULT_AI_SEQUENCE_MODEL, LEGACY_AI_SEQUENCE_MODEL, type AISequenceModel } from './ai-sequence-models'

export class AISequenceConfigError extends Error {
  readonly code = 'AI_CONFIG_INVALID'
  readonly status = 400
  constructor() {
    super('Configuração IA inválida: confira apresentação (até 300 caracteres), modelo, objetivo, intervalos, dias, fuso, janela e link.')
    this.name = 'AISequenceConfigError'
  }
}

export interface AISequenceConfig {
  model?: AISequenceModel
  goal: 'call' | 'meeting'
  brief: string
  presentation?: string
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
  model: DEFAULT_AI_SEQUENCE_MODEL, goal: 'call', brief: '', presentation: '', initial_delay_minutes: 60, repeat_minutes: 1440,
  timezone: 'America/New_York', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00',
  stop_on_stage_exit: true, booking_url: '',
}
/** Shared by save, preview and the API so an incomplete draft never becomes sendable. */
export function validAISchedule(c: AISequenceConfig): boolean {
  return Number.isInteger(c.initial_delay_minutes) && c.initial_delay_minutes >= 0 && c.initial_delay_minutes <= 43200 &&
    Number.isInteger(c.repeat_minutes) && c.repeat_minutes >= 1 && c.repeat_minutes <= 43200 &&
    Array.isArray(c.days) && c.days.length > 0 && c.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(c.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.end) && c.start < c.end
}

export function validateAIConfig(value: unknown): AISequenceConfig & { model: AISequenceModel } {
  const c = value as AISequenceConfig
  const fail = () => { throw new AISequenceConfigError() }
  if (!c || !['call', 'meeting'].includes(c.goal) || typeof c.brief !== 'string' || c.brief.length > 300 ||
    !validAISchedule(c) ||
    typeof c.stop_on_stage_exit !== 'boolean' || typeof c.timezone !== 'string' ||
    typeof c.booking_url !== 'string') fail()
  if (c.presentation !== undefined && (typeof c.presentation !== 'string' || c.presentation.length > 300)) fail()
  if (c.model !== undefined && !AI_SEQUENCE_MODELS.some(option => option.id === c.model)) fail()
  try { new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format() } catch { fail() }
  if (c.booking_url) {
    try {
      const u = new URL(c.booking_url)
      // Explicit public HTTPS URL only; never fetched server-side. No credentials, IPs or local domains.
      if (c.booking_url.length > 250 || /[\s<>"'`\\]/.test(c.booking_url) || u.protocol !== 'https:' || u.username || u.password || u.port ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) || /\.(local|internal|localhost)$/i.test(u.hostname)) fail()
    } catch { fail() }
  }
  return { model: c.model ?? LEGACY_AI_SEQUENCE_MODEL, goal: c.goal, brief: c.brief, presentation: c.presentation?.trim() ?? '', initial_delay_minutes: c.initial_delay_minutes, repeat_minutes: c.repeat_minutes,
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
