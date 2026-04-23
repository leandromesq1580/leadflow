import { createAdminClient } from './supabase/admin'
import { sendLeadNotificationEmail, sendTeamMemberNotification } from './notifications'

async function assignLeadToBuyer(
  supabase: ReturnType<typeof createAdminClient>,
  lead: Lead,
  buyer: { id: string; name: string; email: string; phone?: string; notification_email?: boolean; notification_sms?: boolean }
): Promise<EligibleBuyer> {
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

  return buyer as unknown as EligibleBuyer
}

/**
 * Round-robin assignment entre N emails. Usado APENAS para leads do Meta
 * (chamado no /api/poll-leads), nao afeta imports manuais/CSV.
 *
 * Logica: busca o ULTIMO lead Meta (meta_lead_id NOT NULL) atribuido a qualquer
 * um desses emails. Se o ultimo foi pro email A, o proximo vai pro B (e vice-versa).
 * Se nunca teve nenhum, comeca pelo primeiro da lista.
 */
export async function forceAssignRoundRobin(
  lead: Lead & { meta_lead_id?: string | null },
  emails: string[]
): Promise<EligibleBuyer | null> {
  if (emails.length === 0) return null
  const supabase = createAdminClient()

  // Pega buyers dos emails, na ordem que veio
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .in('email', emails)

  if (!buyers || buyers.length === 0) {
    console.error(`[Distribute] ROUND_ROBIN: nenhum buyer encontrado para ${emails.join(',')}`)
    return null
  }

  // Ordena buyers na mesma ordem dos emails recebidos (case-insensitive)
  const ordered = emails
    .map(e => buyers.find(b => b.email.toLowerCase() === e.toLowerCase().trim()))
    .filter((b): b is NonNullable<typeof b> => !!b)

  if (ordered.length === 0) {
    console.error(`[Distribute] ROUND_ROBIN: emails nao casaram com buyers`)
    return null
  }

  // Busca ULTIMO lead Meta atribuido a qualquer buyer da lista
  const buyerIds = ordered.map(b => b.id)
  const { data: lastLead } = await supabase
    .from('leads')
    .select('assigned_to, assigned_at')
    .in('assigned_to', buyerIds)
    .not('meta_lead_id', 'is', null)
    .neq('id', lead.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Escolhe o PROXIMO buyer (alternando)
  let nextBuyer = ordered[0]
  if (lastLead?.assigned_to) {
    const lastIdx = ordered.findIndex(b => b.id === lastLead.assigned_to)
    if (lastIdx >= 0) {
      nextBuyer = ordered[(lastIdx + 1) % ordered.length]
    }
  }

  const assigned = await assignLeadToBuyer(supabase, lead, nextBuyer)
  console.log(`[Distribute] ROUND_ROBIN: lead ${lead.id} → ${nextBuyer.name} (anterior: ${lastLead?.assigned_to || 'nenhum'})`)
  return assigned
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
