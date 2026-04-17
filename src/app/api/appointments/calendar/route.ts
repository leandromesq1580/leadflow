import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/appointments/calendar?buyer_id=X&from=ISO&to=ISO
 * Retorna eventos unificados: appointments + follow-ups com scheduled_at
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

  // 1) Appointments (tabela dedicada)
  const { data: appts } = await db
    .from('appointments')
    .select('id, scheduled_at, status, qualification_notes, lead:leads(id, name, phone, state)')
    .eq('buyer_id', buyerId)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at')

  // 2) Follow-ups com scheduled_at
  const { data: fus } = await db
    .from('follow_ups')
    .select('id, type, description, scheduled_at, completed_at, lead:leads(id, name, phone, state)')
    .eq('buyer_id', buyerId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at')

  const events = [
    ...(appts || []).map((a: any) => ({
      id: `appt-${a.id}`,
      kind: 'appointment' as const,
      title: `${a.lead?.name || 'Appointment'}`,
      subtitle: a.qualification_notes?.slice(0, 50) || '',
      start: a.scheduled_at,
      status: a.status,
      lead_id: a.lead?.id,
      lead_name: a.lead?.name,
      lead_phone: a.lead?.phone,
      color: a.status === 'completed' ? '#10b981' : a.status === 'no_show' ? '#ef4444' : '#6366f1',
      raw_id: a.id,
    })),
    ...(fus || []).map((f: any) => ({
      id: `fu-${f.id}`,
      kind: 'followup' as const,
      title: `${f.lead?.name || 'Lead'}: ${f.description?.slice(0, 40) || ''}`,
      subtitle: f.type || '',
      start: f.scheduled_at,
      status: f.completed_at ? 'completed' : 'pending',
      lead_id: f.lead?.id,
      lead_name: f.lead?.name,
      lead_phone: f.lead?.phone,
      color: f.completed_at ? '#10b981' : (f.type === 'call' ? '#f59e0b' : f.type === 'meeting' ? '#8b5cf6' : '#06b6d4'),
      raw_id: f.id,
    })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json({ events })
}
