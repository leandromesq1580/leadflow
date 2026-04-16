import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** PATCH /api/pipeline-leads/[id] — move lead to different stage */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { stage_id, position } = await request.json()
  const db = createAdminClient()

  const update: Record<string, unknown> = { moved_at: new Date().toISOString() }
  if (stage_id !== undefined) update.stage_id = stage_id
  if (position !== undefined) update.position = position

  const { data, error } = await db.from('pipeline_leads').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
