export interface AdminRule {
  admin_emails?: string[]
  one_in?: number
  daily_quota?: number
  daily_max?: number | null
}

export interface AdminRuleCandidate {
  id: string
  email: string
  is_active: boolean
  states: string[]
  receivedToday: number
}

export type AdminRuleBlock = 'disabled' | 'inactive' | 'no_license' | 'daily_paused' | 'daily_limit'

export function easternDayStartISO(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)
  const g = (t: string) => p.find(x => x.type === t)!.value
  const hour = g('hour') === '24' ? '00' : g('hour')
  const offsetMs = Math.floor(now.getTime() / 1000) * 1000 - Date.parse(`${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}:${g('second')}Z`)
  // Resolve the offset AT midnight too, including daylight-saving transition days.
  const midnight = Date.parse(`${g('year')}-${g('month')}-${g('day')}T00:00:00Z`)
  const guess = new Date(midnight + offsetMs)
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(guess))
  return new Date(guess.getTime() + (localHour === 23 ? 1 : -localHour) * 3600_000).toISOString()
}

export function adminRuleTurn(rule: AdminRule | null | undefined, assignedCount: number) {
  const rawN = Number(rule?.one_in ?? rule?.daily_quota ?? 0)
  const N = Number.isInteger(rawN) && rawN > 0 ? rawN : 0
  const position = assignedCount + 1
  return { N, position, isTurn: N > 0 && position % N === 0, leadsUntilAdmin: N > 0 ? Math.ceil(position / N) * N - assignedCount : null }
}

export function adminDailyBlock(rule: AdminRule | null | undefined, receivedToday: number): AdminRuleBlock | null {
  const max = rule?.daily_max
  if (max == null) return null
  if (max <= 0) return 'daily_paused'
  return receivedToday >= max ? 'daily_limit' : null
}

/** Same decision for delivery, dry-run and queue. A capped turn is skipped, not reassigned to another admin. */
export function evaluateAdminRule<T extends AdminRuleCandidate>(rule: AdminRule | null | undefined, assignedCount: number, candidates: T[], state?: string | null) {
  const turn = adminRuleTurn(rule, assignedCount)
  const emails = (rule?.admin_emails || []).map(e => e.trim().toLowerCase()).filter(Boolean)
  const result = (candidate: T | null, blockedReason: AdminRuleBlock | null) => ({ ...turn, candidate, blockedReason, eligible: candidate !== null && blockedReason === null })
  if (!turn.N || !emails.length) return result(null, 'disabled')
  const active = emails.map(email => candidates.find(c => c.email.toLowerCase() === email && c.is_active)).filter((c): c is T => !!c)
  if (!active.length) return result(null, 'inactive')
  const pool = state ? active.filter(c => c.states.includes(state.toUpperCase())) : active
  if (!pool.length) return result(null, 'no_license')
  const index = (Math.max(Math.floor(turn.position / turn.N), 1) - 1) % pool.length
  const candidate = pool[index]
  return result(candidate, adminDailyBlock(rule, candidate.receivedToday))
}
