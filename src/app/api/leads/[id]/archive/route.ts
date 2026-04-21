import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/archive
 * Archive a lead: flag leads.archived=true and remove it from every pipeline
 * so it disappears from the Kanban. The lead itself (messages, follow-ups,
 * activities) is preserved.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  // Find which buyer this user is (for archived_by)
  const { data: buyer } = await db
    .from('buyers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // Verify the lead exists
  const { data: lead, error: fetchErr } = await db
    .from('leads')
    .select('id, archived')
    .eq('id', id)
    .single()
  if (fetchErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.archived) return NextResponse.json({ ok: true, already: true })

  // Mark as archived
  const { error: updateErr } = await db
    .from('leads')
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
      archived_by: buyer?.id || null,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Remove from every pipeline so it disappears from Kanban boards everywhere
  const { error: delErr } = await db.from('pipeline_leads').delete().eq('lead_id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
