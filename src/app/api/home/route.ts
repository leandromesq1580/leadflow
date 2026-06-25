import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/home — agregador da tela Início do app mobile.
 * Resolve o buyer pela SESSÃO (cookie), nunca por ?buyer_id (evita brecha).
 * Cada query é tolerante a falha (try/catch → 0), igual o dashboard server.
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, name, crm_plan').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)
  const sIso = start.toISOString(), eIso = end.toISOString()

  let leadsToday = 0, newLeads = 0, totalLeads = 0, converted = 0, remaining = 0, totalPurchased = 0, apptsToday = 0

  try { const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyer.id).gte('created_at', sIso); leadsToday = count || 0 } catch {}
  try { const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyer.id).eq('status', 'assigned'); newLeads = count || 0 } catch {}
  try { const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyer.id); totalLeads = count || 0 } catch {}
  try { const { count } = await db.from('lead_activity').select('*', { count: 'exact', head: true }).eq('buyer_id', buyer.id).eq('action', 'converted'); converted = count || 0 } catch {}

  try {
    const { data: credits } = await db.from('credits').select('type, total_purchased, total_used').eq('buyer_id', buyer.id)
    const lc = (credits || []).filter(c => c.type === 'lead')
    totalPurchased = lc.reduce((s, c) => s + (c.total_purchased || 0), 0)
    remaining = totalPurchased - lc.reduce((s, c) => s + (c.total_used || 0), 0)
  } catch {}

  try {
    const [a, f, c] = await Promise.all([
      db.from('appointments').select('id', { count: 'exact', head: true }).eq('buyer_id', buyer.id).gte('scheduled_at', sIso).lte('scheduled_at', eIso).in('status', ['scheduled', 'confirmed']),
      db.from('follow_ups').select('id', { count: 'exact', head: true }).eq('buyer_id', buyer.id).not('scheduled_at', 'is', null).gte('scheduled_at', sIso).lte('scheduled_at', eIso).is('completed_at', null),
      db.from('calendar_items').select('id', { count: 'exact', head: true }).eq('buyer_id', buyer.id).eq('kind', 'event').gte('start_at', sIso).lte('start_at', eIso).is('completed_at', null),
    ])
    apptsToday = (a.count || 0) + (f.count || 0) + (c.count || 0)
  } catch {}

  let recent: any[] = []
  try {
    const { data } = await db.from('leads')
      .select('id, name, phone, city, state, status, interest, created_at')
      .eq('assigned_to', buyer.id).order('created_at', { ascending: false }).limit(6)
    recent = data || []
  } catch {}

  return NextResponse.json({
    first_name: buyer.name?.split(' ')[0] || '',
    leads_today: leadsToday,
    new_leads: newLeads,
    total_leads: totalLeads,
    remaining_credits: remaining,
    total_purchased: totalPurchased,
    conversion_rate: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    appointments_today: apptsToday,
    recent_leads: recent,
  })
}
