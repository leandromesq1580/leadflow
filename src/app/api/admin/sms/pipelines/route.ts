import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/sms/pipelines?buyer_id=X — pipelines do comprador com suas
 * colunas (stages), pro filtro de segmentação do SMS em massa.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'buyer_id obrigatório' }, { status: 400 })

  const { data: pipelines } = await db
    .from('pipelines')
    .select('id, name, is_default, stages:pipeline_stages(id, name, position)')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: true })

  const out = (pipelines || []).map((p: any) => ({
    id: p.id,
    name: p.name || (p.is_default ? 'Pipeline padrão' : 'Pipeline'),
    stages: (p.stages || []).sort((a: any, b: any) => a.position - b.position)
      .map((s: any) => ({ id: s.id, name: s.name || `Coluna ${s.position + 1}` })),
  }))

  return NextResponse.json({ pipelines: out })
}
