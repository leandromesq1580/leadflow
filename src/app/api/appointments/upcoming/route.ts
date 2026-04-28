import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/appointments/upcoming?buyer_id=X&minutes=90
 * Retorna próximos eventos (appointments + followups + calendar_items) na janela.
 * Usado pelo MeetingBanner — polling a cada 30s.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  const minutes = Math.max(5, Math.min(240, Number(url.searchParams.get('minutes')) || 90))

  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const now = new Date()
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + minutes * 60_000).toISOString()

  const [apptsRes, fusRes, itemsRes] = await Promise.all([
    db.from('appointments')
      .select('id, scheduled_at, status, lead:leads(id, name, phone)')
      .eq('buyer_id', buyerId)
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_at')
      .limit(20),

    db.from('follow_ups')
      .select('id, type, description, scheduled_at, status, lead:leads(id, name, phone)')
      .eq('buyer_id', buyerId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
      .is('completed_at', null)
      .order('scheduled_at')
      .limit(20),

    db.from('calendar_items')
      .select('id, kind, title, start_at, location')
      .eq('buyer_id', buyerId)
      .eq('kind', 'event')
      .gte('start_at', fromIso)
      .lte('start_at', toIso)
      .is('completed_at', null)
      .order('start_at')
      .limit(20),
  ])

  const events = [
    ...(apptsRes.data || []).map((a: any) => ({
      id: `appointment-${a.id}`,
      raw_id: a.id,
      type: 'appointment' as const,
      title: a.lead?.name ? `Appointment com ${a.lead.name}` : 'Appointment',
      subtitle: a.lead?.phone || '',
      start: a.scheduled_at,
      lead_id: a.lead?.id || null,
    })),
    ...(fusRes.data || []).map((f: any) => ({
      id: `followup-${f.id}`,
      raw_id: f.id,
      type: 'followup' as const,
      title: f.lead?.name ? `${f.type === 'meeting' ? 'Reunião' : f.type === 'call' ? 'Ligação' : 'Follow-up'} com ${f.lead.name}` : (f.description || 'Follow-up'),
      subtitle: f.description?.slice(0, 60) || '',
      start: f.scheduled_at,
      lead_id: f.lead?.id || null,
    })),
    ...(itemsRes.data || []).map((i: any) => ({
      id: `calendar_item-${i.id}`,
      raw_id: i.id,
      type: 'calendar_item' as const,
      title: i.title,
      subtitle: i.location || '',
      start: i.start_at,
      lead_id: null,
    })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({ events, server_time: fromIso })
}
