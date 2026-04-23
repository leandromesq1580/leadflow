import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/team/member-pipeline?member_id=X
 * Retorna o pipeline (stages + leads) do team_member em formato de espelho.
 *
 * - Se o membro tem auth_user_id → busca o buyer associado e o default pipeline dele
 * - Se não → retorna um pseudo-pipeline com colunas padrão, preenchido com os
 *   leads assigned_to_member mas sem stage (todos viram "Novo Lead")
 */
export async function GET(request: NextRequest) {
  const memberId = new URL(request.url).searchParams.get('member_id')
  if (!memberId) return NextResponse.json({ error: 'Missing member_id' }, { status: 400 })

  const db = createAdminClient()

  const { data: member } = await db
    .from('team_members')
    .select('id, name, email, auth_user_id, buyer_id')
    .eq('id', memberId)
    .single()

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // 1) Se o membro tem conta propria, espelha o pipeline dele
  // Match por 2 caminhos (nessa ordem):
  //   a) team_members.auth_user_id → buyers.auth_user_id (link direto, rapido)
  //   b) team_members.email → buyers.email (case insensitive) — cobre casos
  //      em que o user criou team_member ANTES de a pessoa ter conta, e ela
  //      se cadastrou depois sem auto-link
  let memberBuyerId: string | null = null
  if (member.auth_user_id) {
    const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', member.auth_user_id).maybeSingle()
    memberBuyerId = buyer?.id || null
  }
  if (!memberBuyerId && member.email) {
    const { data: buyerByEmail } = await db
      .from('buyers')
      .select('id, auth_user_id')
      .ilike('email', member.email)
      .maybeSingle()
    if (buyerByEmail?.id) {
      memberBuyerId = buyerByEmail.id
      // Backfill: linka o team_member ao auth_user_id encontrado pra evitar
      // essa busca da proxima vez.
      if (buyerByEmail.auth_user_id && !member.auth_user_id) {
        await db
          .from('team_members')
          .update({ auth_user_id: buyerByEmail.auth_user_id })
          .eq('id', member.id)
      }
    }
  }

  if (memberBuyerId) {
    const { data: pipe } = await db
      .from('pipelines')
      .select('id, name, is_default, stages:pipeline_stages(id, name, color, position)')
      .eq('buyer_id', memberBuyerId)
      .eq('is_default', true)
      .maybeSingle()

    if (pipe?.id) {
      const pipeline = {
        ...pipe,
        stages: (pipe.stages || []).sort((a: any, b: any) => a.position - b.position),
      }

      const { data: plRaw } = await db
        .from('pipeline_leads')
        .select('id, stage_id, position, moved_at, lead:leads(id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value, assigned_to_member)')
        .eq('pipeline_id', pipe.id)
        .order('position')

      // Anexa último follow-up (pagina pra driblar limit 1000 do PostgREST)
      const leadIds = (plRaw || []).map((pl: any) => pl.lead?.id).filter(Boolean)
      const latestByLead: Record<string, any> = {}
      if (leadIds.length > 0) {
        const PAGE = 1000
        for (let offset = 0; offset < 20000; offset += PAGE) {
          const { data: fus } = await db
            .from('follow_ups')
            .select('lead_id, type, scheduled_at, created_at')
            .in('lead_id', leadIds)
            .order('scheduled_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE - 1)
          if (!fus || fus.length === 0) break
          for (const fu of fus) {
            if (!latestByLead[fu.lead_id]) latestByLead[fu.lead_id] = fu
          }
          if (fus.length < PAGE) break
        }
      }

      const leads = (plRaw || []).map((pl: any) => ({
        ...pl,
        last_follow_up: pl.lead?.id ? latestByLead[pl.lead.id] || null : null,
      }))

      return NextResponse.json({
        member: { id: member.id, name: member.name, email: member.email, has_own_pipeline: true },
        pipeline,
        leads,
      })
    }
  }

  // 2) Fallback: membro sem conta propria — monta pseudo-pipeline so com "Atribuidos"
  const { data: leadsRaw } = await db
    .from('leads')
    .select('id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value, assigned_to_member')
    .eq('assigned_to_member', memberId)
    .order('created_at', { ascending: false })
    .limit(500)

  // Popula last_follow_up pra cada lead (mesma logica do caso com conta propria)
  const leadIdsPseudo = (leadsRaw || []).map((L: any) => L.id).filter(Boolean)
  const latestPseudo: Record<string, any> = {}
  if (leadIdsPseudo.length > 0) {
    const PAGE = 1000
    for (let offset = 0; offset < 20000; offset += PAGE) {
      const { data: fus } = await db
        .from('follow_ups')
        .select('lead_id, type, scheduled_at, created_at')
        .in('lead_id', leadIdsPseudo)
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (!fus || fus.length === 0) break
      for (const fu of fus) {
        if (!latestPseudo[fu.lead_id]) latestPseudo[fu.lead_id] = fu
      }
      if (fus.length < PAGE) break
    }
  }

  const pseudoStageId = `pseudo-${memberId}`
  const pseudoPipeline = {
    id: `pseudo-pipe-${memberId}`,
    name: 'Leads atribuidos',
    is_default: false,
    stages: [{ id: pseudoStageId, name: 'Atribuidos', color: '#6366f1', position: 0 }],
  }
  const leads = (leadsRaw || []).map((L: any, i: number) => ({
    id: `pseudo-pl-${L.id}`,
    stage_id: pseudoStageId,
    position: i,
    moved_at: L.created_at,
    lead: L,
    last_follow_up: latestPseudo[L.id] || null,
  }))

  return NextResponse.json({
    member: { id: member.id, name: member.name, email: member.email, has_own_pipeline: false },
    pipeline: pseudoPipeline,
    leads,
  })
}
