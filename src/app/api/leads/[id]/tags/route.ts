import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data } = await db.from('lead_tags').select('tag_id, tags(id, name, color)').eq('lead_id', id)
  const tags = (data || []).map((r: any) => r.tags).filter(Boolean)
  return NextResponse.json({ tags })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { tag_id } = await request.json()
  if (!tag_id) return NextResponse.json({ error: 'Missing tag_id' }, { status: 400 })

  const db = createAdminClient()
  const { error } = await db.from('lead_tags').insert({ lead_id: leadId, tag_id }).select().maybeSingle()
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const url = new URL(request.url)
  const tagId = url.searchParams.get('tag_id')
  if (!tagId) return NextResponse.json({ error: 'Missing tag_id' }, { status: 400 })

  const db = createAdminClient()
  await db.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId)
  return NextResponse.json({ success: true })
}
