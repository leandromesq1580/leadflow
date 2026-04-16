import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/team/leads?buyer_id=X — all leads assigned to team members */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data } = await db
    .from('leads')
    .select('id, name, phone, state, interest, type, status, created_at, contract_closed, assigned_to_member, member:team_members!assigned_to_member(id, name)')
    .eq('assigned_to', buyerId)
    .not('assigned_to_member', 'is', null)
    .order('created_at', { ascending: false })

  return NextResponse.json({ leads: data || [] })
}
