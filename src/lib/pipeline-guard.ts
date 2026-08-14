import { createServerSupabase } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Guarda de autorização do kanban (incidente 2026-08-14: leads da Regiane
 * resetados de fase e gravados em quadros de outras contas — as rotas de
 * escrita do pipeline aceitavam qualquer lead em qualquer quadro, sem login).
 *
 * Regras:
 *  - toda operação exige sessão;
 *  - operar um quadro exige ser o dono, admin, ou agência com o dono na equipe;
 *  - ADICIONAR lead a um quadro exige que o lead pertença àquele dono
 *    (assigned_to) OU já viva em algum quadro dele — a operação mista
 *    (lead entregue a uma conta, trabalhado no quadro de outra) continua
 *    funcionando, mas lead de fora não entra mais.
 */

export type AtorPipeline = {
  buyerId: string
  isAdmin: boolean
  authUserId: string
  memberId: string | null // sessão de membro de equipe agindo pela conta dona
}

/** Resolve a sessão pra um "ator": buyer direto, ou membro de equipe agindo pela conta dona. */
export async function atorDaSessao(db: Db): Promise<AtorPipeline | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: b } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).maybeSingle()
  if (b) return { buyerId: b.id, isAdmin: !!b.is_admin, authUserId: user.id, memberId: null }

  const { data: m } = await db.from('team_members')
    .select('id, buyer_id').eq('auth_user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (m) return { buyerId: m.buyer_id, isAdmin: false, authUserId: user.id, memberId: m.id }

  return null
}

/** Dono, admin, ou agência que tem o dono do quadro como membro da equipe (espelho). */
export async function podeOperarQuadro(db: Db, ator: AtorPipeline, pipelineBuyerId: string): Promise<boolean> {
  if (ator.isAdmin || ator.buyerId === pipelineBuyerId) return true

  const { data: dono } = await db.from('buyers').select('email, auth_user_id').eq('id', pipelineBuyerId).maybeSingle()
  if (!dono) return false
  const { data: vinculos } = await db.from('team_members')
    .select('id, email, auth_user_id').eq('buyer_id', ator.buyerId).eq('is_active', true)
  return (vinculos || []).some(v =>
    (dono.auth_user_id && v.auth_user_id === dono.auth_user_id) ||
    (dono.email && v.email && v.email.toLowerCase().trim() === dono.email.toLowerCase().trim()))
}

/** O lead pode entrar no quadro desse dono? (é dele, ou já vive em quadro dele) */
export async function leadPertenceAoQuadro(db: Db, leadId: string, pipelineBuyerId: string): Promise<boolean> {
  const { data: lead } = await db.from('leads').select('assigned_to').eq('id', leadId).maybeSingle()
  if (!lead) return false
  if (lead.assigned_to === pipelineBuyerId) return true

  const { data: pipesDoDono } = await db.from('pipelines').select('id').eq('buyer_id', pipelineBuyerId)
  const ids = (pipesDoDono || []).map(p => p.id)
  if (ids.length === 0) return false
  const { data: jaNoQuadro } = await db.from('pipeline_leads')
    .select('id').eq('lead_id', leadId).in('pipeline_id', ids).limit(1).maybeSingle()
  return !!jaNoQuadro
}

/**
 * Trilha de auditoria de movimentos (migration 038_pipeline_moves.sql — manual).
 * Nunca lança: sem a tabela, o movimento acontece e a trilha fica muda.
 */
export async function registraMovimento(db: Db, mov: {
  lead_id: string | null
  pipeline_id: string | null
  stage_id: string | null
  from_pipeline_id?: string | null
  from_stage_id?: string | null
  action: 'add' | 'move' | 'remove'
  via: string
  ator: AtorPipeline
}): Promise<void> {
  try {
    await db.from('pipeline_moves').insert({
      lead_id: mov.lead_id,
      pipeline_id: mov.pipeline_id,
      stage_id: mov.stage_id,
      from_pipeline_id: mov.from_pipeline_id || null,
      from_stage_id: mov.from_stage_id || null,
      action: mov.action,
      via: mov.via,
      actor_buyer_id: mov.ator.buyerId,
      actor_auth_user_id: mov.ator.authUserId,
      actor_member_id: mov.ator.memberId,
    })
  } catch { /* tabela ainda não migrada — segue sem trilha */ }
}
