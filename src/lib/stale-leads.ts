/** Lead staleness logic — baseado na atividade mais recente.
 *
 * Considera múltiplas referências (varargs) e usa a mais recente:
 *   - pipeline_leads.moved_at (movimento entre stages)
 *   - last_follow_up.scheduled_at / created_at (follow-up registrado)
 *   - leads.updated_at (qualquer atualização do lead — incl. msg WhatsApp)
 *
 * Bug histórico: olhava só pra moved_at, então cards com follow-up recente
 * mas movido há dias mostravam "Xd parado" mesmo com atividade ativa.
 */

export type StaleLevel = 'fresh' | 'warning' | 'alert' | 'critical'

export interface StaleInfo {
  level: StaleLevel
  days: number
  label: string
  color: string
  bg: string
}

export function getStaleness(...candidates: (string | null | undefined)[]): StaleInfo {
  const validMs = candidates
    .filter((s): s is string => Boolean(s))
    .map(s => new Date(s).getTime())
    .filter(t => Number.isFinite(t) && !Number.isNaN(t))

  if (validMs.length === 0) return { level: 'fresh', days: 0, label: '', color: '', bg: '' }

  const lastActivityMs = Math.max(...validMs)
  const elapsedMs = Date.now() - lastActivityMs
  const days = Math.floor(elapsedMs / 86400000)

  if (days >= 7) return { level: 'critical', days, label: `${days}d parado`, color: '#dc2626', bg: '#fef2f2' }
  if (days >= 3) return { level: 'alert', days, label: `${days}d parado`, color: '#ea580c', bg: '#fff7ed' }
  if (days >= 1) return { level: 'warning', days, label: `${days}d`, color: '#ca8a04', bg: '#fefce8' }
  return { level: 'fresh', days, label: '', color: '', bg: '' }
}

export function isStale(
  candidates: (string | null | undefined)[],
  threshold: 'warning' | 'alert' | 'critical' = 'alert',
): boolean {
  const info = getStaleness(...candidates)
  if (threshold === 'warning') return info.level !== 'fresh'
  if (threshold === 'alert') return info.level === 'alert' || info.level === 'critical'
  return info.level === 'critical'
}
