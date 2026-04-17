import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST /api/admin/buyers/[id]/grant-credits — manually add credits to a buyer */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data: me } = await adminDb.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, quantity, note } = await request.json()
  if (!['lead', 'cold_lead', 'appointment'].includes(type) || !quantity || quantity < 1) {
    return NextResponse.json({ error: 'Invalid type or quantity' }, { status: 400 })
  }

  const { data, error } = await adminDb.from('credits').insert({
    buyer_id: id,
    type,
    total_purchased: quantity,
    total_used: 0,
    price_per_unit: 0,
    stripe_payment_id: `manual:${note || 'admin grant'}`,
    purchased_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ credit: data })
}
