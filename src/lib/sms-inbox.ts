import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>
export type SmsInboxScope = { buyerId: string; leadId?: string | null; admin?: boolean }
type SmsRow = {
  id: string; lead_id: string; direction: 'in' | 'out'; body: string
  from_phone: string | null; to_phone: string | null; created_at: string | null
  status: string; read_at: string | null
}
function scopeArgs(scope: SmsInboxScope) {
  return { p_buyer_id: scope.buyerId, p_lead_id: scope.leadId || null, p_admin: !!scope.admin }
}

/** Read the original SMS rows, never create WhatsApp copies. SQL applies current
 * effective ownership. Empty terminal page is required even with server caps. */
export async function readSmsInbox(db: Db, scope: SmsInboxScope, unreadOnly = false) {
  const messages: (SmsRow & { channel: 'sms'; sent_at: string | null })[] = []
  let after: string | null = null
  for (;;) {
    const { data, error }: { data: SmsRow[] | null; error: unknown } = await db.rpc('read_sms_inbox', {
      ...scopeArgs(scope), p_unread_only: unreadOnly, p_after: after,
    })
    if (error || !Array.isArray(data)) throw new Error('SMS inbox unavailable')
    if (!data.length) return messages
    for (const row of data as SmsRow[]) {
      if (!row.id || (after && row.id <= after)) throw new Error('SMS inbox pagination unavailable')
      after = row.id
      messages.push({ id: `sms-${row.id}`, lead_id: row.lead_id, direction: row.direction,
        body: row.body, from_phone: row.from_phone, to_phone: row.to_phone,
        created_at: row.created_at, sent_at: row.created_at, channel: 'sms',
        status: row.status, read_at: row.read_at })
    }
  }
}

/** IDs from the displayed snapshot avoid acknowledging unseen SMS arriving while
 * the thread loads. Omitted IDs retain the explicit mark-all API semantics. */
export async function markSmsInboxRead(db: Db, scope: SmsInboxScope, ids?: string[]) {
  const { error } = await db.rpc('mark_sms_inbox_read', { ...scopeArgs(scope), p_ids: ids ?? null })
  if (error) throw new Error('SMS read state unavailable')
}
