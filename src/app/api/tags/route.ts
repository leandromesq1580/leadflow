import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data: tags } = await db.from('tags').select('*').eq('buyer_id', buyerId).order('name')
  return NextResponse.json({ tags: tags || [] })
}

export async function POST(request: NextRequest) {
  try {
    const { buyer_id, name, color } = await request.json()
    if (!buyer_id || !name?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data, error } = await db.from('tags').insert({
      buyer_id,
      name: name.trim(),
      color: color || '#6366f1',
    }).select().single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Tag ja existe' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ tag: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
