import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/leads/archived
 * List archived leads belonging to the current buyer (or its team members).
 * Used by the "Arquivados" view in the pipeline UI.
 */
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  // Resolve current buyer
  const { data: buyer } = await db
    .from('buyers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!buyer) return NextResponse.json({ leads: [] })

  // Collect this buyer's team_member ids (to also show archived leads of their team)
  const { data: members } = await db
    .from('team_members')
    .select('id')
    .eq('owner_buyer_id', buyer.id)
  const memberIds = (members || []).map((m) => m.id)

  // Archived leads owned by the buyer OR assigned to any of their members
  const { data, error } = await db
    .from('leads')
    .select(
      'id, name, email, phone, city, state, interest, type, status, created_at, archived_at, archived_by, assigned_to, assigned_to_member, contract_closed, policy_value',
    )
    .eq('archived', true)
    .or(
      memberIds.length > 0
        ? `assigned_to.eq.${buyer.id},assigned_to_member.in.(${memberIds.join(',')})`
        : `assigned_to.eq.${buyer.id}`,
    )
    .order('archived_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}
