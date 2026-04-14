import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/leads/[id]/activity
 * Add activity to a lead (contacted, no_answer, callback, converted, etc.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!buyer) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  }

  const body = await request.json()
  const { action, notes } = body

  const validActions = ['contacted', 'no_answer', 'callback', 'meeting_set', 'converted', 'lost']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Create activity
  const { data, error } = await supabase
    .from('lead_activity')
    .insert({
      lead_id: leadId,
      buyer_id: buyer.id,
      action,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update lead status based on activity
  const statusMap: Record<string, string> = {
    converted: 'qualified',
    meeting_set: 'qualified',
  }
  if (statusMap[action]) {
    await supabase
      .from('leads')
      .update({ status: statusMap[action] })
      .eq('id', leadId)
  }

  return NextResponse.json({ activity: data })
}
