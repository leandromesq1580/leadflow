import type { createAdminClient } from './supabase/admin'
import { easternDayStartISO, type AdminRule } from './admin-rule'
import { readBuyerPolicy } from './buyer-policy'

interface CreditBalanceRow {
  buyer_id: string
  total_purchased: number | null
  total_used: number | null
  expires_at: string | null
}

/** Negative delivery debt never expires; expired positive credit does. */
export function netLeadCredit(rows: CreditBalanceRow[], now = Date.now()): number {
  return rows.reduce((total, row) => {
    const balance = Number(row.total_purchased || 0) - Number(row.total_used || 0)
    if (balance < 0) return total + balance
    if (!row.expires_at || new Date(row.expires_at).getTime() > now) return total + balance
    return total
  }, 0)
}

/** Read-only snapshot. Never treat a failed query as zero usage / an available turn. */
export async function readAdminRuleState(db: ReturnType<typeof createAdminClient>, rule: AdminRule | null | undefined, leadLanguage?: 'pt' | 'es') {
  const emails = [...new Set((rule?.admin_emails || []).map(e => e.trim().toLowerCase()).filter(Boolean))]
  let countQuery = db.from('leads').select('*', { count: 'exact', head: true }).not('meta_lead_id', 'is', null).not('assigned_to', 'is', null)
  if (leadLanguage) countQuery = countQuery.eq('lead_language', leadLanguage)
  const { count, error: countError } = await countQuery
  if (countError) throw countError
  const { data: buyers, error: buyerError } = emails.length
    ? await db.from('buyers').select('id, name, email, phone, notification_email, notification_sms, is_active').in('email', emails)
    : { data: [], error: null }
  if (buyerError) throw buyerError
  const ids = (buyers || []).map(b => b.id)
  const [{ data: states, error: stateError }, { data: credits, error: creditError }, policy] = await Promise.all([
    ids.length
      ? db.from('buyer_states').select('buyer_id, state_code').in('buyer_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from('credits').select('buyer_id, total_purchased, total_used, expires_at')
        .in('buyer_id', ids).eq('type', 'lead').eq('lead_language', leadLanguage || 'pt')
      : Promise.resolve({ data: [], error: null }),
    readBuyerPolicy(db),
  ])
  if (stateError) throw stateError
  if (creditError) throw creditError
  const dayStart = easternDayStartISO()
  const candidates = await Promise.all((buyers || []).map(async buyer => {
    let receivedQuery = db.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to', buyer.id).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
    if (leadLanguage) receivedQuery = receivedQuery.eq('lead_language', leadLanguage)
    const { count: receivedToday, error } = await receivedQuery
    if (error) throw error
    return {
      ...buyer,
      is_active: !!buyer.is_active,
      states: (states || []).filter(s => s.buyer_id === buyer.id).map(s => s.state_code),
      receivedToday: receivedToday || 0,
      isStaff: policy.staffIds.has(buyer.id),
      priorityCredits: netLeadCredit((credits || []).filter(c => c.buyer_id === buyer.id)),
    }
  }))
  return { assignedCount: count || 0, candidates }
}
