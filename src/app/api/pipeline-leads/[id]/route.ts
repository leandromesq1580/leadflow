import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutomations } from '@/lib/automation-engine'
import { autoEnrollByStage, cancelEnrollmentsForStage, processSequencesForLead } from '@/lib/sequence-engine'

/** PATCH /api/pipeline-leads/[id] — move lead to different stage */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { stage_id, position } = await request.json()
  const db = createAdminClient()

  // Pega o stage ANTIGO antes de atualizar — usado pra cancelar sequences
  // cujo trigger era esse stage (lead saiu dele → sequence nao faz mais sentido)
  let prevStageId: string | null = null
  if (stage_id !== undefined) {
    const { data: prev } = await db
      .from('pipeline_leads')
      .select('stage_id')
      .eq('id', id)
      .maybeSingle()
    prevStageId = prev?.stage_id || null
  }

  const update: Record<string, unknown> = { moved_at: new Date().toISOString() }
  if (stage_id !== undefined) update.stage_id = stage_id
  if (position !== undefined) update.position = position

  const { data, error } = await db.from('pipeline_leads').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // pipeline_leads NAO tem buyer_id — precisa buscar via pipelines.buyer_id.
  // Antes o codigo usava data.buyer_id (undefined) → automations e sequences
  // NUNCA disparavam. Bug silencioso.
  if (stage_id && data?.lead_id && data?.pipeline_id) {
    const { data: pipe } = await db
      .from('pipelines')
      .select('buyer_id')
      .eq('id', data.pipeline_id)
      .maybeSingle()
    const buyerId = pipe?.buyer_id

    // Se o lead foi movido pra um stage do tipo "No Show" (cliente faltou),
    // cancela follow_ups type=meeting com scheduled_at futuro. Sem isso, a
    // automacao 'meeting_before' continua disparando 'Aviso de Reuniao' pra
    // reuniao que ja nao vai acontecer (ex: Rodrigo Teixeira em No Show
    // recebendo aviso de reuniao agendada faz 1 mes).
    const { data: newStage } = await db
      .from('pipeline_stages')
      .select('name')
      .eq('id', stage_id)
      .maybeSingle()
    const stageName = (newStage?.name || '').toLowerCase().trim()
    const isNoShow = stageName.includes('no show') || stageName.includes('noshow') || stageName.includes('no-show')
    if (isNoShow) {
      const nowIso = new Date().toISOString()
      await db
        .from('follow_ups')
        .update({ status: 'no_show', completed_at: nowIso })
        .eq('lead_id', data.lead_id)
        .eq('type', 'meeting')
        .gt('scheduled_at', nowIso)
        .is('completed_at', null)
    }

    if (buyerId) {
      runAutomations([buyerId]).catch(err => console.error('[Automation trigger] Error:', err))

      // Cancela sequences ATIVAS cujo trigger era o stage de ONDE o lead saiu
      if (prevStageId && prevStageId !== stage_id) {
        cancelEnrollmentsForStage(data.lead_id, prevStageId, buyerId)
          .catch(err => console.error('[Sequence cancel] Error:', err))
      }

      // Auto-enroll em sequences com trigger_stage_id = stage_id novo.
      // Apos o enroll, processa imediato pra steps com delay=0 ('Imediatamente')
      // dispararem sem esperar o cron de 5min.
      const leadIdForEnroll = data.lead_id
      autoEnrollByStage(leadIdForEnroll, stage_id, buyerId)
        .then(() => processSequencesForLead(leadIdForEnroll))
        .catch(err => console.error('[Sequence autoEnroll/process] Error:', err))
    }
  }

  return NextResponse.json({ entry: data })
}

/** DELETE /api/pipeline-leads/[id] — remove lead from current pipeline (caller usually insere de novo em outra pipeline) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('pipeline_leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
