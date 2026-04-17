import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/leads/[id]/pipeline
 * Retorna o pipeline_lead entry (se existir) com pipeline e stage atual
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, pipeline:pipelines(id, name, is_default), stage:pipeline_stages(id, name, color, position)')
    .eq('lead_id', id)
    .order('moved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ pipelineLead: data || null })
}
