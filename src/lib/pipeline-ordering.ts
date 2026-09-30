export type PipelineOrder = 'newest' | 'conversation'
export type OrderCard = { id: string; lead: { id: string; created_at?: string | null } }
export type ConversationDates = Record<string, string | null>
function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : -Infinity
}
const idOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const descending = (a: number, b: number) => a === b ? 0 : a > b ? -1 : 1
/** Presentation only; callers select a column first. Never mutates cards or stages. */
export function orderPipelineCards<T extends OrderCard>(cards: readonly T[], mode: PipelineOrder, dates: ConversationDates): T[] {
  return [...cards].sort((a,b) => (mode === 'conversation' ? descending(time(dates[a.lead.id]),time(dates[b.lead.id])) : 0) || descending(time(a.lead.created_at),time(b.lead.created_at)) || idOrder(a.lead.id,b.lead.id) || idOrder(a.id,b.id))
}
