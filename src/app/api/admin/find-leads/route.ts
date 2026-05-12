import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/find-leads?secret=X&q=Y
 * Busca leads por nome (ilike), retorna estado completo + pipeline_leads.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = url.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const db = createAdminClient()
  const pat = `%${q}%`

  const { data: leads } = await db
    .from('leads')
    .select('id, name, phone, email, state, status, assigned_to, assigned_to_member, archived, contract_closed, created_at, assigned_at, updated_at')
    .ilike('name', pat)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!leads || leads.length === 0) return NextResponse.json({ q, count: 0, leads: [] })

  // Resolve assigned_to → buyer
  const ownerIds = Array.from(new Set(leads.map(l => l.assigned_to).filter(Boolean)))
  const ownerMap = new Map<string, any>()
  if (ownerIds.length > 0) {
    const { data: bs } = await db.from('buyers').select('id, name, email').in('id', ownerIds)
    for (const b of bs || []) ownerMap.set(b.id, { name: b.name, email: b.email })
  }
  const memberIds = Array.from(new Set(leads.map(l => l.assigned_to_member).filter(Boolean)))
  const memberMap = new Map<string, any>()
  if (memberIds.length > 0) {
    const { data: ms } = await db.from('team_members').select('id, name, email').in('id', memberIds)
    for (const m of ms || []) memberMap.set(m.id, { name: m.name, email: m.email })
  }

  // Pipeline_leads
  const leadIds = leads.map(l => l.id)
  const { data: pls } = await db
    .from('pipeline_leads')
    .select('lead_id, stage_id, moved_at, pipeline:pipelines(id, name, buyer_id), stage:pipeline_stages(name)')
    .in('lead_id', leadIds)
  const plByLead = new Map<string, any[]>()
  for (const pl of pls || []) {
    if (!plByLead.has(pl.lead_id)) plByLead.set(pl.lead_id, [])
    plByLead.get(pl.lead_id)!.push(pl)
  }

  return NextResponse.json({
    q,
    count: leads.length,
    leads: leads.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      state: l.state,
      status: l.status,
      archived: l.archived,
      contract_closed: l.contract_closed,
      assigned_to: l.assigned_to ? ownerMap.get(l.assigned_to) : null,
      assigned_to_member: l.assigned_to_member ? memberMap.get(l.assigned_to_member) : null,
      created_at: l.created_at,
      assigned_at: l.assigned_at,
      pipeline_leads: plByLead.get(l.id) || [],
    })),
  })
}
