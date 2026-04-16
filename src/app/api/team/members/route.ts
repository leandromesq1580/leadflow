import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getBuyerFromAuth(authUserId: string) {
  const db = createAdminClient()
  const { data } = await db.from('buyers').select('id, is_agency').eq('auth_user_id', authUserId).single()
  return data
}

/** GET /api/team/members — List team members for current buyer */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const authId = request.headers.get('x-auth-user-id') || url.searchParams.get('auth_user_id')
  const directBuyerId = url.searchParams.get('buyer_id')

  let buyerId: string
  if (directBuyerId) {
    buyerId = directBuyerId
  } else if (authId) {
    const buyer = await getBuyerFromAuth(authId)
    if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
    buyerId = buyer.id
  } else {
    return NextResponse.json({ error: 'Missing auth' }, { status: 401 })
  }
  const buyer = { id: buyerId }

  const db = createAdminClient()
  const { data: members } = await db
    .from('team_members')
    .select('*')
    .eq('buyer_id', buyer.id)
    .order('created_at', { ascending: true })

  // Get lead counts per member
  const { data: leads } = await db
    .from('leads')
    .select('assigned_to_member')
    .eq('assigned_to', buyer.id)
    .not('assigned_to_member', 'is', null)

  const counts: Record<string, number> = {}
  for (const l of leads || []) {
    counts[l.assigned_to_member] = (counts[l.assigned_to_member] || 0) + 1
  }

  const enriched = (members || []).map(m => ({
    ...m,
    leads_count: counts[m.id] || 0,
  }))

  return NextResponse.json({ members: enriched })
}

/** POST /api/team/members — Add a team member */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { auth_user_id, name, email, phone, whatsapp } = body
  if (!auth_user_id || !name) return NextResponse.json({ error: 'Missing name or auth' }, { status: 400 })

  const buyer = await getBuyerFromAuth(auth_user_id)
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const db = createAdminClient()

  // Auto-enable agency mode on first member add
  if (!buyer.is_agency) {
    await db.from('buyers').update({ is_agency: true }).eq('id', buyer.id)
  }

  const { data, error } = await db
    .from('team_members')
    .insert({ buyer_id: buyer.id, name, email: email || null, phone: phone || null, whatsapp: whatsapp || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}
