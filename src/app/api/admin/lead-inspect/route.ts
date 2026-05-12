import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/lead-inspect?secret=X&lead_id=Y
 * Retorna estado completo de um lead.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const leadId = url.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'Missing lead_id' }, { status: 400 })

  const db = createAdminClient()
  const { data: lead } = await db.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Buyer atual (assigned_to)
  let assignedBuyer = null
  if (lead.assigned_to) {
    const { data } = await db.from('buyers').select('id, name, email, crm_plan, is_active').eq('id', lead.assigned_to).maybeSingle()
    assignedBuyer = data
  }

  // Team member (assigned_to_member)
  let assignedMember = null
  if (lead.assigned_to_member) {
    const { data } = await db.from('team_members').select('id, name, email, buyer_id').eq('id', lead.assigned_to_member).maybeSingle()
    assignedMember = data
  }

  // Pipeline_leads (em qualquer pipeline)
  const { data: pls } = await db
    .from('pipeline_leads')
    .select('id, pipeline_id, stage_id, moved_at, pipeline:pipelines(id, name, buyer_id), stage:pipeline_stages(name)')
    .eq('lead_id', leadId)

  return NextResponse.json({
    lead: {
      id: lead.id, name: lead.name, phone: lead.phone, email: lead.email,
      city: lead.city, state: lead.state, status: lead.status,
      assigned_to: lead.assigned_to, assigned_at: lead.assigned_at,
      assigned_to_member: lead.assigned_to_member,
      contract_closed: lead.contract_closed,
      created_at: lead.created_at, updated_at: lead.updated_at,
    },
    assigned_buyer: assignedBuyer,
    assigned_member: assignedMember,
    pipeline_leads: pls || [],
  })
}
