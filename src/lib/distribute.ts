import { createAdminClient } from './supabase/admin'
import { sendLeadNotificationEmail } from './notifications'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  city: string
  state: string
  interest: string
  campaign_name: string
  product_type: 'lead' | 'appointment'
}

interface EligibleBuyer {
  id: string
  name: string
  email: string
  phone: string
  notification_email: boolean
  notification_sms: boolean
  leads_count: number
  credit_id: string
  remaining: number
}

/**
 * Distribute a new lead to the next eligible buyer using round-robin.
 * Only distributes leads with product_type = 'lead'.
 * Appointments go to admin queue instead.
 */
export async function distributeLeadToNextBuyer(lead: Lead): Promise<EligibleBuyer | null> {
  // Appointments are NOT auto-distributed — they go to admin queue
  if (lead.product_type === 'appointment') {
    return null
  }

  const supabase = createAdminClient()

  // 1. Find eligible buyers with remaining lead credits
  const { data: buyers, error } = await supabase.rpc('get_eligible_buyers', {
    p_product_type: 'lead',
  })

  if (error || !buyers || buyers.length === 0) {
    console.log('[Distribute] No eligible buyers found for lead', lead.id)
    return null
  }

  // 2. Sort by least leads received (round-robin fairness)
  const sorted = (buyers as EligibleBuyer[]).sort(
    (a, b) => a.leads_count - b.leads_count
  )

  const selectedBuyer = sorted[0]

  // 3. Assign lead to buyer
  const { error: assignError } = await supabase
    .from('leads')
    .update({
      assigned_to: selectedBuyer.id,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    })
    .eq('id', lead.id)

  if (assignError) {
    console.error('[Distribute] Failed to assign lead:', assignError)
    return null
  }

  // 4. Decrement buyer's credits
  const { error: creditError } = await supabase
    .from('credits')
    .update({
      total_used: (await supabase
        .from('credits')
        .select('total_used')
        .eq('id', selectedBuyer.credit_id)
        .single()
      ).data!.total_used + 1,
    })
    .eq('id', selectedBuyer.credit_id)

  if (creditError) {
    console.error('[Distribute] Failed to decrement credit:', creditError)
  }

  // 5. Notify buyer
  if (selectedBuyer.notification_email) {
    await sendLeadNotificationEmail(selectedBuyer, lead)
  }

  console.log(`[Distribute] Lead ${lead.id} assigned to ${selectedBuyer.name} (${selectedBuyer.id})`)

  return selectedBuyer
}
