import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/team/member-pipeline?member_id=X
 *
 * Retorna o espelho do pipeline do team_member: as colunas sao as do PIPELINE DO
 * DONO (agency buyer), porque os leads sao propriedade da agencia. Filtramos os
 * pipeline_leads onde lead.assigned_to_member = member_id.
 *
 * Isso:
 *  - Mostra TODAS as colunas (Novo Lead, Atendido, Qualificado, ...) em vez de
 *    apenas "Atribuidos"
 *  - Respeita os stages em que o dono/membro ja moveu os leads
 *  - Traz last_follow_up em cada card
 *  - Funciona igual pra membro com ou sem conta propria (has_own_account e
 *    apenas um flag informativo pro banner)
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

  // Checa se o membro tem conta propria (pra flag do banner).
  // Match: auth_user_id direto OU email → buyers.email (case insensitive).
  // Se achar via email e nao tiver auth_user_id no team_member, backfill pra
  // acelerar proximas chamadas.
  let hasOwnAccount = false
  if (member.auth_user_id) {
    const { data: b } = await db
      .from('buyers')
      .select('id')
      .eq('auth_user_id', member.auth_user_id)
      .maybeSingle()
    if (b?.id) hasOwnAccount = true
  }
  if (!hasOwnAccount && member.email) {
    const { data: b } = await db
      .from('buyers')
      .select('id, auth_user_id')
      .ilike('email', member.email)
      .maybeSingle()
    if (b?.id) {
      hasOwnAccount = true
      if (b.auth_user_id && !member.auth_user_id) {
        await db
          .from('team_members')
          .update({ auth_user_id: b.auth_user_id })
          .eq('id', member.id)
      }
    }
  }

  // Pipeline default do DONO (agency buyer). Colunas = as dele.
  // member.buyer_id no schema eh o ID do DONO (agency), ver migrations/003
  const agencyBuyerId = (member as any).buyer_id as string | null
  if (!agencyBuyerId) {
    return NextResponse.json({ error: 'Member has no agency buyer_id' }, { status: 400 })
  }

  const { data: pipe } = await db
    .from('pipelines')
    .select('id, name, is_default, stages:pipeline_stages(id, name, color, position)')
    .eq('buyer_id', agencyBuyerId)
    .eq('is_default', true)
    .maybeSingle()

  if (!pipe?.id) {
    // Dono sem pipeline default — fallback pra nao quebrar a UI
    const pseudoStageId = `pseudo-${memberId}`
    return NextResponse.json({
      member: { id: member.id, name: member.name, email: member.email, has_own_pipeline: hasOwnAccount },
      pipeline: {
        id: `pseudo-pipe-${memberId}`,
        name: 'Leads atribuidos',
        is_default: false,
        stages: [{ id: pseudoStageId, name: 'Atribuidos', color: '#6366f1', position: 0 }],
      },
      leads: [],
    })
  }

  const pipeline = {
    ...pipe,
    stages: (pipe.stages || []).sort((a: any, b: any) => a.position - b.position),
  }

  // Leads no pipeline da agencia cujo lead.assigned_to_member = memberId
  const { data: plRaw } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, lead:leads!inner(id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value, assigned_to_member)')
    .eq('pipeline_id', pipe.id)
    .eq('lead.assigned_to_member', memberId)
    .order('position')

  // Anexa ultimo follow-up (pagina pra driblar limit 1000 do PostgREST)
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
    member: { id: member.id, name: member.name, email: member.email, has_own_pipeline: hasOwnAccount },
    pipeline,
    leads,
  })
}
