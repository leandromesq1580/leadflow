import { hasWhatsAppContent, isCustomerReply } from './wa-message-content'

type Message = { id: string; direction?: string | null; body?: string | null; media_type?: string | null; media_url?: string | null; wa_message_id?: string | null }

/** Metadata is not message content. Bound IN URLs and exhaust each ID keyset,
 * including short pages, before treating a missing record as genuinely absent. */
export async function readConversationMetadata<T extends { id: string }>(
  ids: string[],
  page: (ids: string[], after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const result: T[] = []
  const uniqueIds = Array.from(new Set(ids)).sort()
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const block = uniqueIds.slice(offset, offset + 100)
    const allowed = new Set(block)
    let after: string | null = null
    for (;;) {
      const { data, error } = await page(block, after)
      if (error || !data) throw new Error('Conversation metadata unavailable')
      if (!data.length) break
      for (const row of data) {
        if (!row.id || !allowed.has(row.id) || (after !== null && row.id <= after)) {
          throw new Error('Conversation metadata pagination unavailable')
        }
        result.push(row)
        after = row.id
      }
    }
  }
  return result
}

/** Null/invalid timestamps are schema-permitted (e.g. legacy rows); sort them last,
 * never let a missing date crash the comparator or win over a real one. */
export function compareTimestamp<T>(get: (row: T) => string | null | undefined, direction: 'asc' | 'desc' = 'asc') {
  return (a: T, b: T) => {
    const av = get(a), bv = get(b)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  }
}

/** A historical technical event is not a conversation or a client reply.
 * Do not mutate read_at: missing content can still be recovered later.
 */
export function isConversationMessage(row: Omit<Message, 'id'>): boolean {
  return row.direction === 'in' ? isCustomerReply(row) : row.direction === 'out' && hasWhatsAppContent(row)
}

/** UUID keyset, until empty (PostgREST may cap below the requested page size).
 * Callers must apply their own authorization/scope and order by id ascending.
 */
export async function readWhatsAppHistory<T extends Message>(page: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const result: T[] = []
  let after: string | null = null
  for (;;) {
    const { data, error } = await page(after)
    if (error || !data) throw new Error('Conversation unavailable')
    if (!data.length) return result
    const last: string = data[data.length - 1].id
    if (!last || (after && last <= after)) throw new Error('Conversation pagination unavailable')
    result.push(...data.filter(isConversationMessage))
    after = last
  }
}
