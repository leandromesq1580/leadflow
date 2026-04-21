import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutomations } from '@/lib/automation-engine'

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

  // Fire-and-forget: run automations (stage_entered triggers) for this buyer
  if (stage_id && data?.buyer_id) {
    runAutomations([data.buyer_id]).catch(err => console.error('[Automation trigger] Error:', err))
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
