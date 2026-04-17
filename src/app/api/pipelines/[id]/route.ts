import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, is_default } = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (is_default !== undefined) update.is_default = is_default
  const { data, error } = await db.from('pipelines').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pipeline: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  // Validação: não pode deletar pipeline com leads
  const { count, error: countError } = await db
    .from('pipeline_leads')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_id', id)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Este pipeline tem ${count} lead${count === 1 ? '' : 's'}. Mova os leads pra outro pipeline antes de deletar.`,
      leads_count: count,
    }, { status: 409 })
  }

  // Seguro: sem leads, pode deletar
  await db.from('pipeline_stages').delete().eq('pipeline_id', id)
  const { error } = await db.from('pipelines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
