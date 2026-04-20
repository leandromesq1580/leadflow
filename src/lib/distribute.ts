import { createAdminClient } from './supabase/admin'
import { sendLeadNotificationEmail, sendTeamMemberNotification } from './notifications'

async function forceAssignToEmail(
  supabase: ReturnType<typeof createAdminClient>,
  lead: Lead,
  email: string
): Promise<EligibleBuyer | null> {
  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .ilike('email', email)
    .maybeSingle()

  if (!buyer) {
    console.error(`[Distribute] FORCE_ASSIGN: buyer ${email} not found`)
    return null
  }

  await supabase
    .from('leads')
    .update({
      assigned_to: buyer.id,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    })
    .eq('id', lead.id)

  await sendLeadNotificationEmail(buyer as any, lead)

  const { data: pipe } = await supabase
    .from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', buyer.id)
    .eq('is_default', true)
    .maybeSingle()

  if (pipe?.stages?.length) {
    const firstStage = (pipe.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]
    await supabase.from('pipeline_leads').upsert({
      lead_id: lead.id,
      pipeline_id: pipe.id,
      stage_id: firstStage.id,
      position: 0,
      moved_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,pipeline_id' })
  }

  console.log(`[Distribute] FORCE_ASSIGN: lead ${lead.id} → ${buyer.name}`)
  return buyer as unknown as EligibleBuyer
}

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
 * Distribute a new lead to the next eligible buyer.
 *
 * Rules:
 * 1. Only distribute leads (not appointments — those go to admin queue)
 * 2. Filter by state: buyer must have license in lead's state
 * 3. Weighted by credits: buyer with more remaining credits gets priority
 * 4. If tie, buyer who purchased first gets priority
 */
export async function distributeLeadToNextBuyer(lead: Lead): Promise<EligibleBuyer | null> {
  // Appointments go to admin queue, not auto-distributed
  if (lead.product_type === 'appointment') {
    return null
  }

  const supabase = createAdminClient()

  // Temporary bypass: force all leads to a specific buyer (enquanto Meta nao libera producao)
  const forceEmail = (process.env.FORCE_ASSIGN_TO_EMAIL || '').trim()
  if (forceEmail) {
    const forced = await forceAssignToEmail(supabase, lead, forceEmail)
    if (forced) return forced
    // Buyer nao encontrado → cai no fluxo normal abaixo
  }

  // Get eligible buyers filtered by state + sorted by remaining credits (weighted)
  const { data: buyers, error } = await supabase.rpc('get_eligible_buyers', {
    p_product_type: 'lead',
    p_state: lead.state || null,
  })

  if (error || !buyers || buyers.length === 0) {
    console.log(`[Distribute] No eligible buyers for lead ${lead.id} (state: ${lead.state})`)
    return null
  }

  // Buyers are already sorted by remaining DESC (weighted distribution)
  // Pick the first one (most credits remaining)
  const selectedBuyer = (buyers as EligibleBuyer[])[0]

  // Assign lead to buyer
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

  // Decrement credit
  const { data: credit } = await supabase
    .from('credits')
    .select('total_used')
    .eq('id', selectedBuyer.credit_id)
    .single()

  if (credit) {
    await supabase
      .from('credits')
      .update({ total_used: credit.total_used + 1 })
      .eq('id', selectedBuyer.credit_id)
  }

  // Notify buyer (always — function sends email + WhatsApp to buyer/admin/group)
  await sendLeadNotificationEmail(selectedBuyer, lead)

  // Auto-add to default pipeline (if buyer has one)
  const { data: defaultPipeline } = await supabase
    .from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', selectedBuyer.id)
    .eq('is_default', true)
    .single()

  if (defaultPipeline?.stages?.length) {
    const firstStage = (defaultPipeline.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]
    await supabase.from('pipeline_leads').upsert({
      lead_id: lead.id,
      pipeline_id: defaultPipeline.id,
      stage_id: firstStage.id,
      position: 0,
      moved_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,pipeline_id' })
  }

  // Agency mode: sub-distribute to team member
  const { data: buyerInfo } = await supabase
    .from('buyers')
    .select('is_agency, team_distribution_mode')
    .eq('id', selectedBuyer.id)
    .single()

  if (buyerInfo?.is_agency && buyerInfo.team_distribution_mode === 'auto_roundrobin') {
    await distributeToTeamMember(supabase, selectedBuyer.id, lead)
  }

  console.log(`[Distribute] Lead ${lead.id} (${lead.state}) → ${selectedBuyer.name} (remaining: ${selectedBuyer.remaining - 1})`)

  return selectedBuyer
}

/**
 * Sub-distribute a lead to the next team member (round-robin by lead count).
 */
async function distributeToTeamMember(supabase: ReturnType<typeof createAdminClient>, buyerId: string, lead: Lead) {
  // Get active team members
  const { data: members } = await supabase
    .from('team_members')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (!members || members.length === 0) return

  // Count leads per member for round-robin
  const { data: counts } = await supabase
    .from('leads')
    .select('assigned_to_member')
    .eq('assigned_to', buyerId)
    .not('assigned_to_member', 'is', null)

  const memberCounts: Record<string, number> = {}
  for (const m of members) memberCounts[m.id] = 0
  for (const l of counts || []) {
    if (l.assigned_to_member && memberCounts[l.assigned_to_member] !== undefined) {
      memberCounts[l.assigned_to_member]++
    }
  }

  // Pick member with fewest leads
  const sorted = members.sort((a, b) => (memberCounts[a.id] || 0) - (memberCounts[b.id] || 0))
  const nextMember = sorted[0]

  // Assign
  await supabase
    .from('leads')
    .update({ assigned_to_member: nextMember.id })
    .eq('id', lead.id)

  // Notify team member
  await sendTeamMemberNotification(nextMember, lead)

  console.log(`[Distribute] Team: ${lead.id} → member ${nextMember.name} (${memberCounts[nextMember.id] || 0} leads)`)
}
