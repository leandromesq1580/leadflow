import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  for (const f of ['name', 'description', 'enabled', 'trigger_stage_id']) {
    if (body[f] !== undefined) update[f] = body[f]
  }
  update.updated_at = new Date().toISOString()
  const { error } = await db.from('sequences').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Optional: replace steps
  if (Array.isArray(body.steps)) {
    await db.from('sequence_steps').delete().eq('sequence_id', id)
    const stepRows = body.steps.map((s: any, i: number) => ({
      sequence_id: id,
      step_order: i,
      delay_hours: Number(s.delay_hours) || 0,
      template_id: s.template_id || null,
      custom_body: s.custom_body || null,
      step_type: s.step_type || 'send_template',
    }))
    if (stepRows.length > 0) await db.from('sequence_steps').insert(stepRows)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  await db.from('sequences').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
