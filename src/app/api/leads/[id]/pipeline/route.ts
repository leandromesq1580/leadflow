import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/locale'
import { localizeStageName } from '@/lib/pipeline-i18n'

/**
 * GET /api/leads/[id]/pipeline
 * Retorna o pipeline_lead entry (se existir) com pipeline e stage atual
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale = await getLocale()
  const db = createAdminClient()

  const { data } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, pipeline:pipelines(id, name, is_default), stage:pipeline_stages(id, name, color, position)')
    .eq('lead_id', id)
    .order('moved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Supabase tipa a relação como lista, embora este endpoint sempre retorne
  // uma única etapa. Normalizamos para objeto antes de aplicar o idioma.
  const stage = data && Array.isArray(data.stage) ? data.stage[0] : data?.stage
  const localized = data
    ? { ...data, stage: stage ? { ...stage, name: localizeStageName(stage.name, locale) } : stage }
    : null
  return NextResponse.json(
    { pipelineLead: localized },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
  )
}
