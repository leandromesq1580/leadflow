import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/templates?buyer_id=X — lists buyer's + system templates */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  const db = createAdminClient()
  let query = db.from('templates').select('*').order('is_system', { ascending: false }).order('created_at')
  if (buyerId) query = query.or(`buyer_id.eq.${buyerId},is_system.eq.true`)
  else query = query.eq('is_system', true)
  const { data } = await query
  return NextResponse.json({ templates: data || [] })
}

/** POST /api/templates — create new template */
export async function POST(request: NextRequest) {
  const { buyer_id, name, type, subject, body } = await request.json()
  if (!buyer_id || !name || !type || !body) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createAdminClient()
  const { data, error } = await db.from('templates').insert({
    buyer_id, name, type, subject: subject || null, body, is_system: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}
