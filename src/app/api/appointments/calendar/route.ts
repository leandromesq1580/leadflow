import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/appointments/calendar?buyer_id=X&from=ISO&to=ISO
 * Retorna eventos unificados de 3 fontes:
 *   1. appointments (tabela dedicada)
 *   2. follow_ups com scheduled_at
 *   3. calendar_items (eventos/tarefas independentes)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!buyerId || !from || !to) {
    return NextResponse.json({ error: 'Missing buyer_id, from, to' }, { status: 400 })
  }

  const db = createAdminClient()

  const [apptsRes, fusRes, itemsRes] = await Promise.all([
    db.from('appointments')
      .select('id, scheduled_at, status, qualification_notes, lead:leads(id, name, phone, state)')
      .eq('buyer_id', buyerId)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to)
      .order('scheduled_at'),

    db.from('follow_ups')
      .select('id, type, description, scheduled_at, completed_at, lead:leads(id, name, phone, state)')
      .eq('buyer_id', buyerId)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to)
      .order('scheduled_at'),

    db.from('calendar_items')
      .select('*, lead:leads(id, name, phone)')
      .eq('buyer_id', buyerId)
      .gte('start_at', from)
      .lte('start_at', to)
      .order('start_at'),
  ])

  const appts = apptsRes.data || []
  const fus = fusRes.data || []
  const items = itemsRes.data || []

  const events = [
    // Appointments
    ...appts.map((a: any) => ({
      id: `appt-${a.id}`,
      kind: 'appointment' as const,
      title: `${a.lead?.name || 'Appointment'}`,
      subtitle: a.qualification_notes?.slice(0, 50) || '',
      start: a.scheduled_at,
      end: null,
      status: a.status,
      lead_id: a.lead?.id,
      lead_name: a.lead?.name,
      lead_phone: a.lead?.phone,
      color: a.status === 'completed' ? '#10b981' : a.status === 'no_show' ? '#ef4444' : '#6366f1',
      raw_id: a.id,
      completed: a.status === 'completed',
    })),

    // Follow-ups
    ...fus.map((f: any) => ({
      id: `fu-${f.id}`,
      kind: 'followup' as const,
      title: `${f.lead?.name || 'Lead'}: ${f.description?.slice(0, 40) || ''}`,
      subtitle: f.type || '',
      start: f.scheduled_at,
      end: null,
      status: f.completed_at ? 'completed' : 'pending',
      lead_id: f.lead?.id,
      lead_name: f.lead?.name,
      lead_phone: f.lead?.phone,
      color: f.completed_at ? '#10b981' : (f.type === 'call' ? '#f59e0b' : f.type === 'meeting' ? '#8b5cf6' : '#06b6d4'),
      raw_id: f.id,
      completed: !!f.completed_at,
    })),

    // Calendar items (events + tasks)
    ...items.map((i: any) => ({
      id: `item-${i.id}`,
      kind: i.kind as 'event' | 'task',
      title: i.title,
      subtitle: i.description?.slice(0, 60) || '',
      start: i.start_at,
      end: i.end_at,
      status: i.completed_at ? 'completed' : 'pending',
      lead_id: i.lead?.id || null,
      lead_name: i.lead?.name || null,
      lead_phone: i.lead?.phone || null,
      color: i.completed_at ? '#10b981' : (i.color || (i.kind === 'event' ? '#10b981' : '#0ea5e9')),
      raw_id: i.id,
      completed: !!i.completed_at,
      all_day: !!i.all_day,
      location: i.location,
      description: i.description,
    })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({ events })
}
