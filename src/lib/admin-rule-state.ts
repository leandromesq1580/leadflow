import type { createAdminClient } from './supabase/admin'
import { easternDayStartISO, type AdminRule } from './admin-rule'

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
  const { data: states, error: stateError } = ids.length
    ? await db.from('buyer_states').select('buyer_id, state_code').in('buyer_id', ids)
    : { data: [], error: null }
  if (stateError) throw stateError
  const dayStart = easternDayStartISO()
  const candidates = await Promise.all((buyers || []).map(async buyer => {
    let receivedQuery = db.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to', buyer.id).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
    if (leadLanguage) receivedQuery = receivedQuery.eq('lead_language', leadLanguage)
    const { count: receivedToday, error } = await receivedQuery
    if (error) throw error
    return { ...buyer, is_active: !!buyer.is_active, states: (states || []).filter(s => s.buyer_id === buyer.id).map(s => s.state_code), receivedToday: receivedToday || 0 }
  }))
  return { assignedCount: count || 0, candidates }
}
