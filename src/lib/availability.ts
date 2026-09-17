/**
 * Disponibilidade de recebimento de leads por horário (v1).
 *
 * Regras (decididas com o cliente):
 *  - Fuso: do COMPRADOR. Como não há campo de fuso explícito, derivamos do
 *    conjunto de estados licenciados (fuso predominante). Fallback: Eastern.
 *  - Lead fora da janela do comprador → ele não é elegível AGORA (a distribuição
 *    pula pro próximo disponível; se ninguém, o lead fica pendente e é
 *    reprocessado pelo cron até alguém abrir a janela).
 *  - v1: feriado NÃO é detectado (tratado como o dia da semana real). Domingo
 *    não marcado = não recebe nesse dia.
 *  - Comprador SEM nenhuma disponibilidade configurada = disponível 24/7
 *    (não quebra quem nunca mexeu nessa config).
 */

export type DayType = 'weekday' | 'saturday' | 'sunday' | 'holiday'
export type Period = 'morning' | 'afternoon' | 'evening'
/**
 * `hours` = granularidade OPCIONAL de 1 hora dentro do período.
 *  - null / [] → período INTEIRO (comportamento original, retrocompatível)
 *  - [8,10]    → só 8h e 10h daquele período
 */
export interface AvailabilityRow { day_type: string; period: string; hours?: number[] | null }

/** Horas (locais) que cada período cobre — fonte única pra UI e validação. */
// Regra do dono (17/09/2026): a NOITE vai das 6 PM até 7:59 AM do dia seguinte.
// "Período inteiro" na noite = recebe de madrugada também (alguns clientes não se
// importam); quem não quer madrugada marca só as horas (6 PM, 7 PM, 8 PM...).
export const PERIOD_HOURS: Record<Period, number[]> = {
  morning: [8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16, 17],
  evening: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7],
}

/** Hora em que o "dia" da disponibilidade vira: 0h–7h ainda pertencem à NOITE do dia anterior. */
export const DAY_ROLLOVER_HOUR = 8

/** Rótulo de hora no padrão americano: 8 → "8 AM", 12 → "12 PM", 20 → "8 PM". */
export function hourLabel(h: number): string {
  const n = ((h % 24) + 24) % 24
  const suffix = n < 12 ? 'AM' : 'PM'
  const h12 = n % 12 === 0 ? 12 : n % 12
  return `${h12} ${suffix}`
}

/** Faixa do período no padrão americano: "8 AM–12 PM". */
export function periodRangeLabel(p: Period): string {
  const hs = PERIOD_HOURS[p]
  return `${hourLabel(hs[0])}–${hourLabel(hs[hs.length - 1] + 1)}`
}

/** Mantém só horas válidas do período (defesa contra payload adulterado). */
export function sanitizeHours(period: string, hours: unknown): number[] {
  const allowed = PERIOD_HOURS[period as Period]
  if (!allowed || !Array.isArray(hours)) return []
  const set = new Set(allowed)
  return [...new Set(hours.map(Number).filter(h => Number.isInteger(h) && set.has(h)))].sort((a, b) => a - b)
}

/** Estado (US) → fuso IANA principal. */
const STATE_TZ: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  IN: 'America/New_York', KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York',
  NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York', DC: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago',
  KS: 'America/Chicago', LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago',
  // Mountain
  AZ: 'America/Denver', CO: 'America/Denver', ID: 'America/Denver', MT: 'America/Denver',
  NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  // Pacific
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  // Alaska / Hawaii
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
}

const DEFAULT_TZ = 'America/New_York'
// Prioridade pra desempate (mais a leste primeiro = mais conservador).
const TZ_PRIORITY = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']

/** Fuso predominante entre os estados do comprador. */
export function buyerTimezone(states: string[] | null | undefined): string {
  if (!states || states.length === 0) return DEFAULT_TZ
  const counts: Record<string, number> = {}
  for (const s of states) {
    const tz = STATE_TZ[String(s).toUpperCase()]
    if (tz) counts[tz] = (counts[tz] || 0) + 1
  }
  const entries = Object.entries(counts)
  if (entries.length === 0) return DEFAULT_TZ
  const max = Math.max(...entries.map(([, c]) => c))
  const top = entries.filter(([, c]) => c === max).map(([tz]) => tz)
  // desempate por prioridade leste→oeste
  for (const tz of TZ_PRIORITY) if (top.includes(tz)) return tz
  return top[0]
}

/** Janela atual (day_type + period) no fuso informado. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function currentWindow(tz: string, now: Date = new Date()): { day_type: DayType; period: Period | null; hour: number } {
  let todayName = 'Mon'
  let hour = 12
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false,
    }).formatToParts(now)
    todayName = parts.find(p => p.type === 'weekday')?.value || todayName
    const h = parts.find(p => p.type === 'hour')?.value
    if (h != null) hour = parseInt(h, 10) % 24 // '24' → 0
  } catch { /* tz inválido → usa defaults */ }
  // Madrugada (0h–7h) é o fim da NOITE que começou às 6 PM do dia ANTERIOR: quem marcou
  // "Mon-Fri · Noite" recebe na madrugada de sábado (noite de sexta), mas não na de
  // segunda (noite de domingo). O dia anterior é obtido girando o NOME do dia (calendário),
  // nunca subtraindo horas reais — na virada do horário de verão a noite tem 9h/7h e a
  // subtração cai no dia errado às 7h (verificado: fall-back 01/11 e spring-forward 09/03).
  const idx = WEEKDAYS.indexOf(todayName)
  const weekday = hour < DAY_ROLLOVER_HOUR && idx >= 0 ? WEEKDAYS[(idx + 6) % 7] : todayName

  const day_type: DayType = weekday === 'Sat' ? 'saturday' : weekday === 'Sun' ? 'sunday' : 'weekday'
  // O período vem de PERIOD_HOURS (as MESMAS horas que a tela oferece); as 24h estão cobertas.
  const period: Period | null =
    (Object.keys(PERIOD_HOURS) as Period[]).find(p => PERIOD_HOURS[p].includes(hour)) ?? null

  return { day_type, period, hour }
}

/**
 * O comprador está disponível AGORA pra receber um lead?
 * @param rows linhas de buyer_availability do comprador
 * @param tz fuso do comprador (de buyerTimezone)
 */
export function isAvailableNow(rows: AvailabilityRow[] | null | undefined, tz: string, now: Date = new Date()): boolean {
  // Sem config = disponível sempre (não penaliza quem nunca configurou).
  if (!rows || rows.length === 0) return true
  const { day_type, period, hour } = currentWindow(tz, now)
  if (!period) return false // defesa: PERIOD_HOURS cobre as 24h, não deve acontecer
  const row = rows.find(r => r.day_type === day_type && r.period === period)
  if (!row) return false
  // Granularidade por hora: só restringe se o comprador escolheu horas.
  // Vazio/null = período inteiro (retrocompatível com quem só marcou o bloco).
  const hrs = Array.isArray(row.hours) ? row.hours.map(Number).filter(Number.isFinite) : []
  if (hrs.length === 0) return true
  return hrs.includes(hour)
}
