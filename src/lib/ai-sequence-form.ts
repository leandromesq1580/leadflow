export type DurationUnit = 'minutes' | 'hours' | 'days'
const factors: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 }
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a

/** Non-terminating conversions use a fraction instead of rounding the saved duration. */
export function durationValue(minutes: number, unit: DurationUnit): string {
  if (!Number.isFinite(minutes)) return ''
  const factor = factors[unit]
  const divisor = gcd(minutes, factor)
  const denominator = factor / divisor
  let rest = denominator
  while (rest % 2 === 0) rest /= 2
  while (rest % 5 === 0) rest /= 5
  return rest === 1 ? String(minutes / factor) : `${minutes / divisor}/${denominator}`
}

export function durationMinutes(raw: string, unit: DurationUnit, minimum: number): number {
  const text = raw.trim().replace(',', '.')
  const fraction = /^(\d+)\/(\d+)$/.exec(text)
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!fraction && !decimal) return NaN
  const numerator = fraction ? BigInt(fraction[1]) : BigInt(decimal![1] + (decimal![2] || ''))
  const denominator = fraction ? BigInt(fraction[2]) : BigInt(10) ** BigInt(decimal![2]?.length || 0)
  const scaled = numerator * BigInt(factors[unit])
  if (!denominator || scaled % denominator !== BigInt(0)) return NaN
  const minutes = Number(scaled / denominator)
  return Number.isSafeInteger(minutes) && minutes >= minimum && minutes <= 43200 ? minutes : NaN
}

export function preferredDurationUnit(minutes: number): DurationUnit {
  return minutes > 0 && minutes % 1440 === 0 ? 'days' : minutes > 0 && minutes % 60 === 0 ? 'hours' : 'minutes'
}

export function durationSummary(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'intervalo a revisar'
  const unit = preferredDurationUnit(minutes)
  const value = minutes / factors[unit]
  return `${value} ${unit === 'days' ? value === 1 ? 'dia' : 'dias' : unit === 'hours' ? value === 1 ? 'hora' : 'horas' : value === 1 ? 'minuto' : 'minutos'}`
}
