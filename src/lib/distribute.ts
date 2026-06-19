import { createAdminClient } from './supabase/admin'
import { sendLeadNotificationEmail, sendTeamMemberNotification } from './notifications'
import { buyerTimezone, isAvailableNow } from './availability'

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

  // Pega buyers dos emails, na ordem que veio — só ATIVOS (suspenso não recebe lead)
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .in('email', emails)
    .eq('is_active', true)

  if (!buyers || buyers.length === 0) {
    console.error(`[Distribute] ROUND_ROBIN: nenhum buyer ATIVO encontrado para ${emails.join(',')}`)
    return null
  }

  // Ordena buyers na mesma ordem dos emails recebidos (case-insensitive)
  let ordered = emails
    .map(e => buyers.find(b => b.email.toLowerCase() === e.toLowerCase().trim()))
    .filter((b): b is NonNullable<typeof b> => !!b)

  if (ordered.length === 0) {
    console.error(`[Distribute] ROUND_ROBIN: emails nao casaram com buyers`)
    return null
  }

  // 🔒 LICENÇA ESTADUAL: o roteamento programado NUNCA pode mandar um lead pra
  // quem não tem licença no estado dele (ex: lead de CT pra quem só atende MA).
  // Filtra o pool pelos que têm o estado do lead. Se o lead tem estado e NINGUÉM
  // do pool cobre → retorna null e cai na distribuição normal (que respeita
  // estado + tem fallback). Lead sem estado = não filtra.
  if (lead.state) {
    const ids = ordered.map(b => b.id)
    const { data: stRows } = await supabase.from('buyer_states').select('buyer_id, state_code').in('buyer_id', ids)
    const licensed = new Set((stRows || []).filter(s => s.state_code === lead.state).map(s => s.buyer_id))
    const filtered = ordered.filter(b => licensed.has(b.id))
    if (filtered.length === 0) {
      console.log(`[Distribute] ROUND_ROBIN: ninguém do pool tem licença em ${lead.state} (lead ${lead.id}) — cai na distribuição normal`)
      return null
    }
    ordered = filtered
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

interface AdminRule { admin_emails?: string[]; one_in?: number; daily_quota?: number }

/**
 * REGRA DO ADMINISTRADOR (proporcional, "1 a cada N"): a cada N leads do SISTEMA,
 * 1 vai pro(s) admin(s) selecionado(s) (ex: Regiane), em rodízio entre eles e ANTES
 * da distribuição normal. Pega ~1/N de tudo, ESPALHADO conforme o volume real (não um
 * teto fixo por dia). Respeita licença de estado. one_in=3 → "1 a cada 3" (a cada 2
 * pros outros, o 3º pro admin). Retorna o admin que recebeu, ou null (não é a vez /
 * sem licença / desligado) — aí o lead segue pro roteamento/distribuição normal.
 */
export async function tryAdminRule(
  lead: Lead & { meta_lead_id?: string | null },
  rule?: AdminRule | null,
  dryRun = false
): Promise<EligibleBuyer | null> {
  const everyN = rule?.one_in ?? rule?.daily_quota ?? 0   // back-compat: lê o campo antigo se o novo não existir
  const emails = (rule?.admin_emails || []).filter(Boolean)
  if (everyN <= 0 || emails.length === 0) return null
  const supabase = createAdminClient()

  const { data: admins } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .in('email', emails)
    .eq('is_active', true)
  if (!admins || admins.length === 0) return null

  // Só admins licenciados no estado do lead
  let pool = admins
  if (lead.state) {
    const { data: stRows } = await supabase.from('buyer_states').select('buyer_id, state_code').in('buyer_id', admins.map(a => a.id))
    const licensed = new Set((stRows || []).filter(s => s.state_code === lead.state).map(s => s.buyer_id))
    pool = admins.filter(a => licensed.has(a.id))
  }
  if (pool.length === 0) return null

  // Posição deste lead na sequência de leads do SISTEMA já distribuídos (assigned_to set).
  // A cada N posições é a vez do admin → proporcional ao volume (não teto diário).
  const { count: prior } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('meta_lead_id', 'is', null)
    .not('assigned_to', 'is', null)
  const position = (prior || 0) + 1
  const isTurn = position % everyN === 0

  if (!isTurn && !dryRun) return null   // não é a vez → segue o fluxo normal

  // Rodízio entre os admins licenciados: alterna a cada vez do admin.
  const turn = Math.floor(position / everyN)
  const chosen = pool[(Math.max(turn, 1) - 1) % pool.length]

  // Dry-run (preview/teste): retorna quem PEGARIA sem atribuir nem notificar.
  if (dryRun) return { ...(chosen as any), _everyN: everyN, _position: position, _isTurn: isTurn } as EligibleBuyer
  const assigned = await assignLeadToBuyer(supabase, lead, chosen)
  console.log(`[Distribute] REGRA ADMIN (1 a cada ${everyN}): lead ${lead.id} #${position} → ${chosen.name}`)
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
  created_at?: string
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
/**
 * Fallback 24/7: quando a distribuição normal não acha ninguém (sem comprador
 * do estado, ou ninguém dentro da janela de horário agora), o lead vai pro
 * comprador de fallback (settings.lead_routing.fallback_email — tipicamente a
 * Regiane, que atende sempre). Garante que NADA fica preso. Se não houver
 * fallback configurado/ativo, o lead fica pendente (e o grupo é avisado).
 */
async function assignToFallback(
  supabase: ReturnType<typeof createAdminClient>,
  lead: Lead,
  reason: string,
): Promise<EligibleBuyer | null> {
  const { data: setting } = await supabase.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  const fallbackEmail = (setting?.value as any)?.fallback_email
  if (!fallbackEmail) {
    console.log(`[Distribute] lead ${lead.id} pendente (${reason}) — sem fallback configurado`)
    return null
  }
  const { data: fb } = await supabase
    .from('buyers')
    .select('id, name, email, phone, notification_email, notification_sms')
    .eq('email', fallbackEmail)
    .eq('is_active', true)
    .maybeSingle()
  if (!fb) {
    console.log(`[Distribute] lead ${lead.id} pendente (${reason}) — fallback ${fallbackEmail} inativo/inexistente`)
    return null
  }
  console.log(`[Distribute] FALLBACK → ${fb.name} | lead ${lead.id} (${lead.state}) | motivo: ${reason}`)
  return await assignLeadToBuyer(supabase, lead, fb as any)
}

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
    return await assignToFallback(supabase, lead, `sem comprador p/ estado ${lead.state || '?'}`)
  }

  // Guard defensivo: remove buyers SUSPENSOS (is_active=false) que o RPC possa
  // ter deixado passar. Suspenso nunca recebe lead.
  let eligible = buyers as EligibleBuyer[]
  const ids = eligible.map(b => b.id)
  if (ids.length > 0) {
    const { data: actives } = await supabase.from('buyers').select('id').in('id', ids).eq('is_active', true)
    const activeSet = new Set((actives || []).map(a => a.id))
    eligible = eligible.filter(b => activeSet.has(b.id))
  }
  if (eligible.length === 0) {
    console.log(`[Distribute] Eligible buyers all suspended for lead ${lead.id}`)
    return await assignToFallback(supabase, lead, 'todos os compradores suspensos')
  }

  // Filtro de DISPONIBILIDADE (horário): só recebe quem está dentro da janela
  // configurada AGORA (fuso derivado dos estados do comprador). Quem não tem
  // disponibilidade configurada = disponível 24/7. Se ninguém disponível agora,
  // o lead fica pendente (assigned_to=null) e o cron reprocessa até abrir a janela.
  const eligibleIds = eligible.map(b => b.id)
  const [statesRes, availRes] = await Promise.all([
    supabase.from('buyer_states').select('buyer_id, state_code').in('buyer_id', eligibleIds),
    supabase.from('buyer_availability').select('buyer_id, day_type, period').in('buyer_id', eligibleIds),
  ])
  const statesByBuyer: Record<string, string[]> = {}
  for (const r of statesRes.data || []) (statesByBuyer[r.buyer_id] ||= []).push(r.state_code)
  const availByBuyer: Record<string, { day_type: string; period: string }[]> = {}
  for (const r of availRes.data || []) (availByBuyer[r.buyer_id] ||= []).push({ day_type: r.day_type, period: r.period })

  const availableNow = eligible.filter(b => {
    const tz = buyerTimezone(statesByBuyer[b.id])
    return isAvailableNow(availByBuyer[b.id], tz)
  })
  if (availableNow.length === 0) {
    // Existe comprador do estado, mas fora da janela agora. CARÊNCIA: dá tempo
    // da janela dele abrir antes de cair pro fallback. Dentro da carência →
    // espera (pendente, redistribute tenta de novo). Estourou → fallback (Regiane).
    const { data: rt } = await supabase.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
    const delayH = Number((rt?.value as any)?.fallback_delay_hours) || 6
    const ageH = lead.created_at ? (Date.now() - new Date(lead.created_at).getTime()) / 3600000 : 999
    if (ageH < delayH) {
      console.log(`[Distribute] lead ${lead.id} (${lead.state}) aguardando janela do comprador — ${ageH.toFixed(1)}h/${delayH}h`)
      return null // fica pendente; o redistribute reprocessa (entrega ao dono quando a janela abrir)
    }
    console.log(`[Distribute] lead ${lead.id} aguardou ${ageH.toFixed(1)}h sem janela (carência ${delayH}h) — fallback`)
    return await assignToFallback(supabase, lead, `carência ${delayH}h sem janela`)
  }
  eligible = availableNow

  // Buyers are already sorted by remaining DESC (weighted distribution)
  // Pick the first one (most credits remaining)
  const selectedBuyer = eligible[0]

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
 * Reprocessa leads que ficaram PENDENTES (status=new, sem dono) — tipicamente
 * porque nenhum comprador elegível estava dentro da janela de horário quando o
 * lead chegou. Chamado pelo cron (poll-leads). Quando a janela de alguém abre,
 * o lead é finalmente entregue. Ignora leads muito antigos pra não acumular.
 */
export async function redistributePendingLeads(routingEmails?: string[] | null, maxAgeHours = 72): Promise<number> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString()
  const { data: pending } = await supabase
    .from('leads')
    .select('id, name, email, phone, city, state, interest, campaign_name, product_type, created_at')
    .eq('status', 'new')
    .is('assigned_to', null)
    .eq('product_type', 'lead')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(50)

  // Respeita a PROGRAMAÇÃO: se há um alvo de roteamento (exclusive/sequential),
  // os pendentes vão pro alvo (igual leads novos), não pela distribuição normal.
  // Sem alvo (modo normal) = distribuição por estado/crédito/horário.
  const hasRouting = !!routingEmails && routingEmails.length > 0

  let assigned = 0
  for (const lead of pending || []) {
    try {
      const buyer = hasRouting
        ? await forceAssignRoundRobin(lead as Lead, routingEmails!)
        : await distributeLeadToNextBuyer(lead as Lead)
      if (buyer) { assigned++; console.log(`[Redistribute] Lead pendente ${lead.id} → ${buyer.name}`) }
    } catch (e) {
      console.error(`[Redistribute] erro no lead ${lead.id}:`, (e as any)?.message)
    }
  }
  if (assigned > 0) console.log(`[Redistribute] ${assigned} lead(s) pendente(s) entregue(s)`)
  return assigned
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
