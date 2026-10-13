import type { TrackingStatus } from './email-campaigns'

type EngagementStats = Record<string, number>
type EngagementTracking = Pick<TrackingStatus, 'open' | 'click'> | null | undefined

const rateFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Unique recipients with an event / delivered recipients, never the full audience. */
export function formatCampaignRate(count: number, delivered: number): string {
  return delivered > 0 ? rateFormatter.format(count / delivered * 100) + '% dos entregues' : '—'
}

/** Missing tracking is unavailable, not evidence that nobody read or clicked. */
export function campaignEngagementSummary(stats: EngagementStats, tracking: EngagementTracking): string {
  const delivered = stats.delivered || 0
  const rate = (count: number) => formatCampaignRate(count, delivered).replace(' dos entregues', '')
  const parts = [`${stats.total || 0} destinatários`, `${delivered} entregues`]
  if (tracking?.open === true) {
    parts.push(`${stats.opened || 0} aberturas (${rate(stats.opened || 0)})`, `${stats.unopened || 0} sem abertura`)
  }
  if (tracking?.click === true) parts.push(`${stats.clicked || 0} cliques (${rate(stats.clicked || 0)})`)
  if (stats.unknown) parts.push(`${stats.unknown} resultados incertos`)
  return parts.join(' · ')
}
