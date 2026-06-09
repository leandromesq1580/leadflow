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
export interface AvailabilityRow { day_type: string; period: string }

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

/** Janela atual (day_type + period) no fuso informado. period null = madrugada. */
export function currentWindow(tz: string, now: Date = new Date()): { day_type: DayType; period: Period | null; hour: number } {
  let weekday = 'Mon'
  let hour = 12
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false,
    }).formatToParts(now)
    weekday = parts.find(p => p.type === 'weekday')?.value || weekday
    const h = parts.find(p => p.type === 'hour')?.value
    if (h != null) hour = parseInt(h, 10) % 24 // '24' → 0
  } catch { /* tz inválido → usa defaults */ }

  const day_type: DayType = weekday === 'Sat' ? 'saturday' : weekday === 'Sun' ? 'sunday' : 'weekday'
  const period: Period | null =
    hour >= 6 && hour < 12 ? 'morning' :
    hour >= 12 && hour < 18 ? 'afternoon' :
    hour >= 18 && hour < 24 ? 'evening' : null // 0–5h = madrugada

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
  const { day_type, period } = currentWindow(tz, now)
  if (!period) return false // madrugada: ninguém marca esse período
  return rows.some(r => r.day_type === day_type && r.period === period)
}
