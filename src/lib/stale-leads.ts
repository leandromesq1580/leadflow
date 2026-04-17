/** Lead staleness logic — based on pipeline_leads.moved_at */

export type StaleLevel = 'fresh' | 'warning' | 'alert' | 'critical'

export interface StaleInfo {
  level: StaleLevel
  days: number
  label: string
  color: string
  bg: string
}

export function getStaleness(movedAt: string | null | undefined): StaleInfo {
  if (!movedAt) return { level: 'fresh', days: 0, label: '', color: '', bg: '' }

  const ms = Date.now() - new Date(movedAt).getTime()
  const days = Math.floor(ms / 86400000)

  if (days >= 7) return { level: 'critical', days, label: `${days}d parado`, color: '#dc2626', bg: '#fef2f2' }
  if (days >= 3) return { level: 'alert', days, label: `${days}d parado`, color: '#ea580c', bg: '#fff7ed' }
  if (days >= 1) return { level: 'warning', days, label: `${days}d`, color: '#ca8a04', bg: '#fefce8' }
  return { level: 'fresh', days, label: '', color: '', bg: '' }
}

export function isStale(movedAt: string | null | undefined, threshold: 'warning' | 'alert' | 'critical' = 'alert'): boolean {
  const info = getStaleness(movedAt)
  if (threshold === 'warning') return info.level !== 'fresh'
  if (threshold === 'alert') return info.level === 'alert' || info.level === 'critical'
  return info.level === 'critical'
}
