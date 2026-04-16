import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const { name, color } = await request.json()
  const db = createAdminClient()

  // Get max position
  const { data: stages } = await db.from('pipeline_stages').select('position').eq('pipeline_id', pipelineId).order('position', { ascending: false }).limit(1)
  const nextPos = (stages?.[0]?.position ?? -1) + 1

  const { data, error } = await db
    .from('pipeline_stages')
    .insert({ pipeline_id: pipelineId, name, color: color || '#6366f1', position: nextPos })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stage: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const { stages } = await request.json() // array of { id, name, color, position }
  const db = createAdminClient()

  for (const s of stages || []) {
    const update: Record<string, unknown> = {}
    if (s.name !== undefined) update.name = s.name
    if (s.color !== undefined) update.color = s.color
    if (s.position !== undefined) update.position = s.position
    await db.from('pipeline_stages').update(update).eq('id', s.id).eq('pipeline_id', pipelineId)
  }

  return NextResponse.json({ success: true })
}
