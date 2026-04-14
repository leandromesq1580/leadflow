import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * GET /api/leads
 * Get leads for current buyer (or all leads for admin)
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, is_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!buyer) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  }

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let query = supabase
    .from('leads')
    .select('*, buyer:buyers!assigned_to(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Non-admin: only see their own leads
  if (!buyer.is_admin) {
    query = query.eq('assigned_to', buyer.id)
  }

  if (status) query = query.eq('status', status)
  if (type) query = query.eq('type', type)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data, total: count })
}

/**
 * POST /api/leads
 * Create a lead manually (admin only)
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, is_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!buyer?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('leads')
    .insert({
      name: body.name,
      email: body.email,
      phone: body.phone,
      city: body.city,
      state: body.state,
      interest: body.interest || 'Seguro de vida',
      campaign_name: body.campaign_name || 'Manual',
      type: body.type || 'hot',
      product_type: body.product_type || 'lead',
      status: 'new',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead: data })
}
