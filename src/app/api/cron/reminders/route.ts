import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushToBuyer } from '@/lib/push-notify'

/**
 * GET /api/cron/reminders
 * Envia push notifications pra reuniões que começam em 15min.
 * Roda a cada 5min via cron VPS.
 * Marca `reminded_at` pra evitar duplicado.
 */
export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const in15 = new Date(now.getTime() + 15 * 60_000).toISOString()
  const nowIso = now.toISOString()

  let pushed = 0

  // 1) Follow-ups com scheduled_at entre agora e 15min
  const { data: fus } = await db
    .from('follow_ups')
    .select('id, buyer_id, description, scheduled_at, lead:leads(name)')
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', in15)
    .is('reminded_at', null)
    .is('completed_at', null)
    .limit(100)

  for (const fu of fus || []) {
    const lead = (fu as any).lead
    const when = new Date(fu.scheduled_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    await pushToBuyer(fu.buyer_id, {
      title: `⏰ Reunião às ${when}`,
      body: lead?.name ? `${lead.name}: ${fu.description?.slice(0, 60) || ''}` : fu.description?.slice(0, 80) || 'Follow-up',
      url: '/dashboard/appointments',
      tag: `reminder-fu-${fu.id}`,
    }).catch(() => {})
    await db.from('follow_ups').update({ reminded_at: nowIso }).eq('id', fu.id)
    pushed++
  }

  // 2) Calendar items (eventos + tarefas)
  const { data: items } = await db
    .from('calendar_items')
    .select('id, buyer_id, kind, title, start_at')
    .gte('start_at', nowIso)
    .lte('start_at', in15)
    .is('reminded_at', null)
    .is('completed_at', null)
    .limit(100)

  for (const item of items || []) {
    const when = new Date(item.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const icon = item.kind === 'event' ? '📆' : '☐'
    await pushToBuyer(item.buyer_id, {
      title: `⏰ ${icon} ${when} — ${item.title.slice(0, 40)}`,
      body: item.kind === 'event' ? 'Começa em 15min' : 'Tarefa vencendo',
      url: '/dashboard/appointments',
      tag: `reminder-item-${item.id}`,
    }).catch(() => {})
    await db.from('calendar_items').update({ reminded_at: nowIso }).eq('id', item.id)
    pushed++
  }

  // 3) Appointments
  const { data: appts } = await db
    .from('appointments')
    .select('id, buyer_id, scheduled_at, lead:leads(name)')
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', in15)
    .is('reminded_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .limit(100)

  for (const appt of appts || []) {
    const lead = (appt as any).lead
    const when = new Date(appt.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    await pushToBuyer(appt.buyer_id, {
      title: `⏰ Appointment às ${when}`,
      body: lead?.name ? `Com ${lead.name}` : 'Appointment em 15min',
      url: '/dashboard/appointments',
      tag: `reminder-appt-${appt.id}`,
    }).catch(() => {})
    await db.from('appointments').update({ reminded_at: nowIso }).eq('id', appt.id)
    pushed++
  }

  console.log(`[Cron Reminders] pushed=${pushed}`)
  return NextResponse.json({ pushed })
}
