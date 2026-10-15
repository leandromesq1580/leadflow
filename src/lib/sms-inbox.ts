import type { createAdminClient } from '@/lib/supabase/admin'
import { readWhatsAppHistory } from './wa-message-history'

type SmsReply = { id: string; lead_id: string; buyer_id: string; direction: 'in'; body: string | null; created_at: string | null; read_at: string | null }

/** Server-only view, scoped to current owner, including team-member accounts. */
export async function readSmsReplies(db: ReturnType<typeof createAdminClient>, buyerId: string, unreadOnly = false) {
  const rows = await readWhatsAppHistory<SmsReply>(after => {
    let q = db.from('sms_inbox_messages')
      .select('id,lead_id,buyer_id,direction,body,created_at,read_at')
      .eq('buyer_id', buyerId).eq('direction', 'in').order('id').limit(500)
    if (unreadOnly) q = q.is('read_at', null)
    if (after) q = q.gt('id', after)
    return q
  })
  return rows.map(row => ({ ...row, sent_at: row.created_at, channel: 'sms' as const }))
}
