import { createAdminClient } from './supabase/admin'

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
export async function distributeColdLeads(buyerId: string, quantity: number): Promise<number> {
  const db = createAdminClient()

  // First mark any old leads as cold
  await markColdLeads()

  // Get buyer's states
  const { data: buyerStates } = await db
    .from('buyer_states')
    .select('state_code')
    .eq('buyer_id', buyerId)

  const states = buyerStates?.map(s => s.state_code) || []

  // Get cold unassigned leads, filtered by buyer's states
  let query = db
    .from('leads')
    .select('id')
    .eq('type', 'cold')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(quantity)

  // Filter by state if buyer has states configured
  if (states.length > 0) {
    query = query.in('state', states)
  }

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

  if (error) {
    console.error('[ColdLeads] Failed to assign:', error)
    return 0
  }

  console.log(`[ColdLeads] Distributed ${leadIds.length} cold leads to buyer ${buyerId}`)
  return leadIds.length
}
