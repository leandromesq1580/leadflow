import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atorDaSessao, podeOperarQuadro } from '@/lib/pipeline-guard'

const DEFAULT_STAGES = [
  { name: 'Novo Lead', color: '#3b82f6', position: 0 },
  { name: 'Atendido', color: '#f59e0b', position: 1 },
  { name: 'Qualificado', color: '#10b981', position: 2 },
  { name: 'Envio Proposta', color: '#8b5cf6', position: 3 },
  { name: 'Negociação', color: '#f97316', position: 4 },
  { name: 'Fechado/Ganho', color: '#059669', position: 5 },
  { name: 'Perdido', color: '#ef4444', position: 6 },
]

/** GET /api/pipelines — list buyer's pipelines with stages */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data } = await db
    .from('pipelines')
    .select('*, stages:pipeline_stages(id, name, color, position)')
    .eq('buyer_id', buyerId)
    .order('created_at')

  // Estagios por position dentro de cada pipeline; e as pipelines pela coluna `position`.
  // Resiliente: se a coluna `position` ainda nao existe no banco, vem undefined e
  // o sort vira no-op (mantem a ordem por created_at) — nao quebra antes da migration.
  const pipelines = (data || [])
    .map(p => ({
      ...p,
      stages: (p.stages || []).sort((a: any, b: any) => a.position - b.position),
    }))
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))

  return NextResponse.json({ pipelines })
}

/** POST /api/pipelines — create pipeline with default stages */
export async function POST(request: NextRequest) {
  const { buyer_id, name, populate_existing } = await request.json()
  if (!buyer_id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createAdminClient()

  // 🔒 Trava do incidente 2026-08-14: criar pipeline (e popular com os leads da
  // conta) só o próprio dono, admin ou agência com o dono na equipe.
  const ator = await atorDaSessao(db)
  if (!ator) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await podeOperarQuadro(db, ator, buyer_id))) {
    return NextResponse.json({ error: 'Sem permissão nessa conta' }, { status: 403 })
  }

  // Check if first pipeline (make it default)
  const { count } = await db.from('pipelines').select('id', { count: 'exact', head: true }).eq('buyer_id', buyer_id)
  const isDefault = (count || 0) === 0

  const { data: pipeline, error } = await db
    .from('pipelines')
    .insert({ buyer_id, name, is_default: isDefault })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create default stages
  const stages = DEFAULT_STAGES.map(s => ({ ...s, pipeline_id: pipeline.id }))
  await db.from('pipeline_stages').insert(stages)

  // Popular com os leads existentes APENAS se o usuário pediu (populate_existing).
  // Antes isso era automático e despejava TODOS os leads no pipeline novo —
  // assustador e duplicava os leads entre pipelines. Agora é opt-in.
  let populated = 0
  if (populate_existing) {
    const { data: firstStage } = await db
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .order('position')
      .limit(1)
      .single()

    if (firstStage) {
      const { data: leads } = await db
        .from('leads')
        .select('id')
        .eq('assigned_to', buyer_id)

      if (leads && leads.length > 0) {
        const entries = leads.map((l, i) => ({
          lead_id: l.id,
          pipeline_id: pipeline.id,
          stage_id: firstStage.id,
          position: i,
        }))
        await db.from('pipeline_leads').insert(entries)
        populated = leads.length
      }
    }
  }

  return NextResponse.json({ pipeline, populated })
}
