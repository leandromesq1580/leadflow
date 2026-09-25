import { latestPipelineFollowUps, FOLLOW_UP_LOAD_ERROR } from '@/lib/pipeline-follow-ups'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoEnrollByStage } from '@/lib/sequence-engine'
import { atorDaSessao, podeOperarQuadro, leadPertenceAoQuadro, registraMovimento } from '@/lib/pipeline-guard'

/** GET /api/pipelines/[id]/leads — all leads grouped by stage + latest follow-up */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const db = createAdminClient()

  const ator = await atorDaSessao(db)
  if (!ator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: pipeDono } = await db.from('pipelines').select('buyer_id').eq('id', pipelineId).maybeSingle()
  if (!pipeDono) return NextResponse.json({ error: 'Pipeline não encontrado' }, { status: 404 })
  if (!(await podeOperarQuadro(db, ator, pipeDono.buyer_id))) {
    return NextResponse.json({ error: 'Sem permissão nesse pipeline' }, { status: 403 })
  }

  const { data, error } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, lead:leads!inner(id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value, assigned_to_member, archived, lead_language, form_name, meta_lead_id)')
    .eq('pipeline_id', pipelineId)
    // Hide archived leads from the active Kanban — use !inner above so this WHERE
    // applies to the embedded lead; archived leads are managed in the "Arquivados" view.
    .eq('lead.archived', false)
    // Ordem por IDADE DO LEAD — mais recente (lead.created_at) no topo.
    // PostgREST ordenacao no embed:
    .order('created_at', { referencedTable: 'leads', ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leadIds = (data || []).map((pl: any) => pl.lead?.id).filter(Boolean)
  let latestByLead: Awaited<ReturnType<typeof latestPipelineFollowUps>>
  try {
    latestByLead = await latestPipelineFollowUps(db, leadIds)
  } catch {
    return NextResponse.json({ error: FOLLOW_UP_LOAD_ERROR, code: 'FOLLOW_UP_LOAD_FAILED' }, { status: 503 })
  }

  const enriched = (data || []).map((pl: any) => ({
    ...pl,
    last_follow_up: pl.lead?.id ? latestByLead[pl.lead.id] || null : null,
  }))

  return NextResponse.json({ leads: enriched })
}

/** POST /api/pipelines/[id]/leads — add lead to pipeline */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const { lead_id, stage_id } = await request.json()
  const db = createAdminClient()

  // 🔒 Trava do incidente 2026-08-14: sessão obrigatória + só o dono do quadro
  // (ou admin/agência) adiciona, e o lead precisa PERTENCER àquele dono.
  const ator = await atorDaSessao(db)
  if (!ator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: pipeDono } = await db.from('pipelines').select('buyer_id').eq('id', pipelineId).maybeSingle()
  if (!pipeDono) return NextResponse.json({ error: 'Pipeline não encontrado' }, { status: 404 })
  if (!(await podeOperarQuadro(db, ator, pipeDono.buyer_id))) {
    return NextResponse.json({ error: 'Sem permissão nesse pipeline' }, { status: 403 })
  }
  if (!ator.isAdmin && !(await leadPertenceAoQuadro(db, lead_id, pipeDono.buyer_id))) {
    return NextResponse.json({ error: 'Esse lead pertence a outra conta — não dá pra colocar nesse quadro.' }, { status: 403 })
  }

  const { data, error } = await db
    .from('pipeline_leads')
    .upsert({ lead_id, pipeline_id: pipelineId, stage_id, position: 0, moved_at: new Date().toISOString() }, { onConflict: 'lead_id,pipeline_id' })
    .select('*, pipelines(buyer_id)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  registraMovimento(db, {
    lead_id, pipeline_id: pipelineId, stage_id: stage_id || null,
    action: 'add', via: 'POST /api/pipelines/[id]/leads', ator,
  }).catch(() => {})

  // 🔒 LEAD ÚNICO (regra do dono, 14/08): entrar num quadro REMOVE o lead de
  // quadros de outras contas — mudança, nunca cópia. Um lead jamais aparece
  // em dois usuários ao mesmo tempo. (Migration 039 aplica o mesmo no banco.)
  try {
    const { data: outras } = await db.from('pipeline_leads')
      .select('id, pipeline_id, stage_id, pipelines(buyer_id)')
      .eq('lead_id', lead_id).neq('pipeline_id', pipelineId)
    for (const o of outras || []) {
      const donoOutro = (o as any).pipelines?.buyer_id
      if (donoOutro && donoOutro !== pipeDono.buyer_id) {
        await db.from('pipeline_leads').delete().eq('id', o.id)
        registraMovimento(db, {
          lead_id, pipeline_id: null, stage_id: null,
          from_pipeline_id: o.pipeline_id, from_stage_id: o.stage_id,
          action: 'remove', via: 'lead-unico (saiu de outra conta ao entrar aqui)', ator,
        }).catch(() => {})
      }
    }
  } catch { /* melhor-esforço: o trigger 039 é a garantia final */ }

  // Auto-enroll em sequences com trigger_stage_id = stage_id
  const buyerId = (data as any).buyer_id || (data as any).pipelines?.buyer_id
  if (stage_id && buyerId && lead_id) {
    autoEnrollByStage(lead_id, stage_id, buyerId).catch(err => console.error('[Seq autoEnroll POST] err:', err))
  }

  return NextResponse.json({ entry: data })
}
