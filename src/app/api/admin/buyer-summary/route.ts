import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/buyer-summary?secret=X&email=Y
 *
 * Snapshot completo de um buyer: info basica, pipelines, leads assigned_to,
 * distribuicao por stage, team_members. Util pra investigar estado de uma
 * conta (ex: pra onde foram os leads apos revogar acesso).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = url.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const db = createAdminClient()

  const { data: buyer } = await db.from('buyers')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  // Pipelines do buyer
  const { data: pipelines } = await db
    .from('pipelines')
    .select('id, name, is_default, stages:pipeline_stages(id, name, position)')
    .eq('buyer_id', buyer.id)

  const pipelineIds = (pipelines || []).map((p: any) => p.id)

  // Leads atualmente atribuidos a ela (assigned_to = buyer.id)
  const { data: assignedLeads, count: assignedCount } = await db
    .from('leads')
    .select('id, name, phone, state, status, contract_closed, assigned_at, created_at, assigned_to_member', { count: 'exact' })
    .eq('assigned_to', buyer.id)
    .order('assigned_at', { ascending: false })
    .limit(500)

  // Pipeline_leads dela (todos os stages, todas as pipelines dela)
  let pipelineLeadsByStage: any[] = []
  if (pipelineIds.length > 0) {
    const { data: pls } = await db
      .from('pipeline_leads')
      .select('id, lead_id, stage_id, pipeline_id, moved_at, lead:leads(id, name, phone, contract_closed, assigned_to)')
      .in('pipeline_id', pipelineIds)
      .limit(2000)
    pipelineLeadsByStage = pls || []
  }

  // Distribuicao por stage
  const byStage: Record<string, { stage_name: string; pipeline_name: string; count: number; sample: any[] }> = {}
  for (const pl of pipelineLeadsByStage) {
    const pipe = (pipelines || []).find((p: any) => p.id === pl.pipeline_id)
    const stage = (pipe?.stages || []).find((s: any) => s.id === pl.stage_id)
    const key = `${pipe?.name || '?'} / ${stage?.name || '?'}`
    if (!byStage[key]) byStage[key] = { stage_name: stage?.name || '?', pipeline_name: pipe?.name || '?', count: 0, sample: [] }
    byStage[key].count++
    if (byStage[key].sample.length < 3) byStage[key].sample.push({ lead_id: pl.lead_id, name: (pl.lead as any)?.name, phone: (pl.lead as any)?.phone, moved_at: pl.moved_at })
  }

  // Team members (se for agency)
  let teamMembers: any[] = []
  if (buyer.is_agency) {
    const { data: tms } = await db
      .from('team_members')
      .select('id, name, email, is_active')
      .eq('buyer_id', buyer.id)
    teamMembers = tms || []
  }

  // Total contracts closed
  const closed = (assignedLeads || []).filter((l: any) => l.contract_closed).length

  // Procura tambem leads delegados via team_members (esse email pode estar
  // em team_members de outras agencies)
  const { data: memberRecords } = await db
    .from('team_members')
    .select('id, name, email, buyer_id, is_active, buyer:buyers(id, name, email)')
    .ilike('email', email)

  const asMember: any[] = []
  for (const m of memberRecords || []) {
    const { count: leadsCount } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to_member', m.id)
    const { count: closedCount } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to_member', m.id)
      .eq('contract_closed', true)
    asMember.push({
      member_id: m.id,
      member_name: m.name,
      agency: (m as any).buyer,
      total_leads: leadsCount ?? 0,
      closed: closedCount ?? 0,
      is_active: m.is_active,
    })
  }

  return NextResponse.json({
    buyer: {
      id: buyer.id,
      name: buyer.name,
      email: buyer.email,
      crm_plan: buyer.crm_plan,
      crm_subscription_status: buyer.crm_subscription_status,
      is_active: buyer.is_active,
      is_agency: buyer.is_agency,
      trial_ends_at: buyer.trial_ends_at,
      created_at: buyer.created_at,
    },
    pipelines: (pipelines || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      is_default: p.is_default,
      stages_count: (p.stages || []).length,
    })),
    leads_summary: {
      total_assigned_to: assignedCount ?? 0,
      contracts_closed: closed,
      total_in_pipelines: pipelineLeadsByStage.length,
    },
    pipeline_leads_by_stage: byStage,
    team_members: teamMembers,
    as_team_member_of: asMember,
    recent_leads_sample: (assignedLeads || []).slice(0, 5).map((l: any) => ({
      id: l.id, name: l.name, phone: l.phone, state: l.state, status: l.status,
      contract_closed: l.contract_closed, assigned_at: l.assigned_at,
    })),
  })
}
