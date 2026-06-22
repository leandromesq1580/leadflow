import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { placeLeadInMemberPipeline } from '@/lib/place-member-lead'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/backfill-member-cards — acha TODOS os leads delegados a um membro
 * do time que estão SEM card no pipeline (bug antigo: a delegação não criava o card)
 * e cria o card no pipeline do membro. Idempotente. Só admin.
 */
export async function POST() {
  const supa = await createServerSupabase()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // leads delegados (assigned_to_member != null), nao arquivados, SEM pipeline_leads
  const { data: delegated } = await db.from('leads')
    .select('id, name, assigned_to_member, pipeline_leads(id)')
    .not('assigned_to_member', 'is', null)
    .eq('archived', false)
  const orphans = (delegated || []).filter((l: any) => !l.pipeline_leads || !l.pipeline_leads.length)

  const memberIds = Array.from(new Set(orphans.map((o: any) => o.assigned_to_member)))
  const members = memberIds.length
    ? ((await db.from('team_members').select('*').in('id', memberIds)).data || [])
    : []
  const memberMap = new Map((members as any[]).map((m: any) => [m.id, m]))

  let placed = 0, skipped = 0
  const skippedNames: string[] = []
  for (const o of orphans as any[]) {
    const m = memberMap.get(o.assigned_to_member)
    if (!m) { skipped++; if (skippedNames.length < 25) skippedNames.push(`${o.name} (membro sumido)`); continue }
    const r = await placeLeadInMemberPipeline(db, o.id, m)
    if (r) placed++
    else { skipped++; if (skippedNames.length < 25) skippedNames.push(`${o.name} (membro sem pipeline)`) }
  }
  return NextResponse.json({ ok: true, orfaos: orphans.length, criados: placed, pulados: skipped, pulados_nomes: skippedNames })
}
