import { createAdminClient } from './supabase/admin'
import type { LeadLanguage } from './lead-language'
import { adminDailyBlock, easternDayStartISO, type AdminRule } from './admin-rule'
import { buyerTimezone, isAvailableNow } from './availability'

/**
 * Mark leads older than 7 days as cold if not assigned.
 * Called periodically or on-demand.
 */
export async function markColdLeads() {
  const db = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('leads')
    .update({ type: 'cold' })
    .eq('status', 'new')
    .eq('type', 'hot')
    .lt('created_at', sevenDaysAgo)
    .select('id')

  if (data && data.length > 0) {
    console.log(`[ColdLeads] Marked ${data.length} leads as cold`)
  }

  return data?.length || 0
}

/**
 * Distribute cold leads to a buyer who purchased cold_lead credits.
 * Assigns oldest cold leads first.
 */
export async function distributeColdLeads(buyerId: string, quantity: number, language: LeadLanguage): Promise<number> {
  const db = createAdminClient()

  const { data: routing, error: routingError } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  if (routingError) throw routingError
  const only = routing?.value?.priority_only === true
  if (only) {
    const rule = routing.value.admin_rule as AdminRule | undefined
    const { data: buyer, error } = await db.from('buyers').select('id, email, is_active').eq('id', buyerId).single()
    if (error) throw error
    if (!buyer?.is_active || !(rule?.admin_emails || []).some(email => email.trim().toLowerCase() === buyer.email.toLowerCase())) return 0
    const { data: eligible, error: creditError } = await db.rpc('get_eligible_buyers_by_language', {
      p_product_type: 'cold_lead', p_state: null, p_language: language,
    })
    if (creditError) throw creditError
    const credit = (eligible || []).find((candidate: { id: string; remaining: number }) => candidate.id === buyerId)
    if (!credit || credit.remaining <= 0) return 0
    const { count, error: countError } = await db.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to', buyerId).not('meta_lead_id', 'is', null).eq('lead_language', language).gte('assigned_at', easternDayStartISO())
    if (countError) throw countError
    if (adminDailyBlock(rule, count || 0)) return 0
    quantity = Math.min(quantity, credit.remaining, rule?.daily_max == null ? quantity : rule.daily_max - (count || 0))
  }
  if (quantity <= 0) return 0

  // First mark any old leads as cold
  await markColdLeads()

  // Get buyer's states
  const { data: buyerStates, error: stateError } = await db
    .from('buyer_states')
    .select('state_code')
    .eq('buyer_id', buyerId)

  if (stateError) throw stateError
  const states = buyerStates?.map(s => s.state_code) || []
  if (only) {
    if (!states.length) return 0
    const { data: windows, error } = await db.from('buyer_availability').select('day_type, period, hours').eq('buyer_id', buyerId)
    if (error) throw error
    if (!isAvailableNow(windows || [], buyerTimezone(states))) return 0
  }

  // Get cold unassigned leads, filtered by buyer's states
  let query = db
    .from('leads')
    .select('id')
    .eq('type', 'cold')
    .eq('status', 'new')
    .eq('lead_language', language)
    .is('assigned_to', null)
    .order('created_at', { ascending: true })
    .limit(quantity)

  // Filter by state if buyer has states configured
  if (states.length > 0) {
    query = query.in('state', states)
  }

  if (only) query = query.not('meta_lead_id', 'is', null).eq('product_type', 'lead')
  const { data: coldLeads } = await query

  if (!coldLeads || coldLeads.length === 0) {
    console.log('[ColdLeads] No cold leads available')
    return 0
  }

  // Assign each cold lead to the buyer
  const leadIds = coldLeads.map(l => l.id)

  const { error } = await db
    .from('leads')
    .update({
      assigned_to: buyerId,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    })
    .in('id', leadIds)
    .is('assigned_to', null)

  if (error) {
    console.error('[ColdLeads] Failed to assign:', error)
    return 0
  }

  console.log(`[ColdLeads] Distributed ${leadIds.length} cold leads to buyer ${buyerId}`)
  return leadIds.length
}
