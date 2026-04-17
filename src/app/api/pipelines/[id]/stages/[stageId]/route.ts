import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/pipelines/[id]/stages/[stageId]
 * Deleta um estágio específico do pipeline.
 * Validação: não pode deletar se houver leads nele (movê-los primeiro).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const { id: pipelineId, stageId } = await params
  const db = createAdminClient()

  // Check how many leads are in this stage
  const { count, error: countError } = await db
    .from('pipeline_leads')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stageId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Este estágio tem ${count} lead${count === 1 ? '' : 's'}. Mova ou delete os leads antes de remover o estágio.`,
      leads_count: count,
    }, { status: 409 })
  }

  const { error } = await db
    .from('pipeline_stages')
    .delete()
    .eq('id', stageId)
    .eq('pipeline_id', pipelineId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
