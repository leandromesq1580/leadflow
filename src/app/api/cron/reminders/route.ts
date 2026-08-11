import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushToBuyer } from '@/lib/push-notify'
import { getBridgeForBuyer } from '@/lib/wa-bridge'
import { localesDosBuyers, trad } from '@/lib/buyer-locale'

/**
 * GET /api/cron/reminders
 *
 * Multi-tempo, multi-canal. Roda a cada CRON_WINDOW_MIN minutos.
 * Pra cada evento próximo, lê notification_preferences do buyer e dispara
 * push/whatsapp/email nos intervals configurados. reminder_log (UNIQUE)
 * garante idempotência.
 */

const CRON_WINDOW_MIN = 5

const DEFAULT_PREFS = {
  reminder_intervals: [60, 15, 5],
  push_enabled: true,
  banner_enabled: true,
  whatsapp_enabled: false,
  whatsapp_intervals: [30],
  email_enabled: false,
  email_intervals: [60],
}

type EventType = 'appointment' | 'followup' | 'calendar_item'
type Channel = 'push' | 'whatsapp' | 'email'

/** mesmo espírito do L() da interface — o cron não vê cookie, então o texto é resolvido por buyer */
type Trad = (pt: string, en: string, es: string) => string

interface UpcomingEvent {
  type: EventType
  id: string
  buyer_id: string
  start: string
  title: (T: Trad) => string
  body: (T: Trad) => string
  url: string
  lead_id: string | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function shouldFire(elapsedMs: number, intervalMin: number): boolean {
  // Dispara quando o evento entra na janela do interval:
  // (interval - WINDOW) < minutosAté <= interval
  const upper = intervalMin * 60_000
  const lower = (intervalMin - CRON_WINDOW_MIN) * 60_000
  return elapsedMs > lower && elapsedMs <= upper
}

async function tryRecord(db: ReturnType<typeof createAdminClient>, ev: UpcomingEvent, intervalMin: number, channel: Channel): Promise<boolean> {
  const { error } = await db.from('reminder_log').insert({
    buyer_id: ev.buyer_id,
    event_type: ev.type,
    event_id: ev.id,
    interval_minutes: intervalMin,
    channel,
  })
  // 23505 = unique violation → já enviado
  if (error) return false
  return true
}

async function sendWhatsApp(buyerId: string, phone: string, message: string, db: ReturnType<typeof createAdminClient>) {
  const bridge = await getBridgeForBuyer(db, buyerId)
  const url = bridge?.url || (process.env.WA_BRIDGE_URL || '').replace(/\/$/, '')
  const key = bridge?.key || process.env.WA_BRIDGE_KEY || ''
  if (!url || !key) return false
  const cleanNumber = phone.includes('@g.us') ? phone : phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
  if (!cleanNumber) return false
  try {
    const res = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanNumber, message }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey || !to) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Lead4Producers <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const nowMs = now.getTime()
  // Janela máxima: maior interval razoável + 1 hora de folga
  const maxLookaheadMin = 24 * 60
  const fromIso = now.toISOString()
  const toIso = new Date(nowMs + maxLookaheadMin * 60_000).toISOString()

  // Carrega eventos próximos das 3 fontes
  const [apptsRes, fusRes, itemsRes] = await Promise.all([
    db.from('appointments')
      .select('id, buyer_id, scheduled_at, status, lead:leads(id, name)')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
      .in('status', ['scheduled', 'confirmed'])
      .limit(500),
    db.from('follow_ups')
      .select('id, buyer_id, scheduled_at, type, description, lead:leads(id, name)')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
      .is('completed_at', null)
      .limit(500),
    db.from('calendar_items')
      .select('id, buyer_id, kind, title, start_at')
      .gte('start_at', fromIso)
      .lte('start_at', toIso)
      .is('completed_at', null)
      .limit(500),
  ])

  const events: UpcomingEvent[] = [
    ...(apptsRes.data || []).map((a: any) => ({
      type: 'appointment' as const,
      id: a.id,
      buyer_id: a.buyer_id,
      start: a.scheduled_at,
      title: (T: Trad) => T(`Appointment às ${fmtTime(a.scheduled_at)}`, `Appointment at ${fmtTime(a.scheduled_at)}`, `Appointment a las ${fmtTime(a.scheduled_at)}`),
      body: (T: Trad) => a.lead?.name ? T(`Com ${a.lead.name}`, `With ${a.lead.name}`, `Con ${a.lead.name}`) : 'Appointment',
      url: '/dashboard/appointments',
      lead_id: a.lead?.id || null,
    })),
    ...(fusRes.data || []).map((f: any) => ({
      type: 'followup' as const,
      id: f.id,
      buyer_id: f.buyer_id,
      start: f.scheduled_at,
      title: (T: Trad) => `${f.type === 'meeting' ? T('Reunião', 'Meeting', 'Reunión') : f.type === 'call' ? T('Ligação', 'Call', 'Llamada') : 'Follow-up'} ${T('às', 'at', 'a las')} ${fmtTime(f.scheduled_at)}`,
      body: () => f.lead?.name ? `${f.lead.name}: ${(f.description || '').slice(0, 60)}` : (f.description || '').slice(0, 80),
      url: '/dashboard/appointments',
      lead_id: f.lead?.id || null,
    })),
    ...(itemsRes.data || []).map((i: any) => ({
      type: 'calendar_item' as const,
      id: i.id,
      buyer_id: i.buyer_id,
      start: i.start_at,
      title: () => `${i.kind === 'event' ? '📆' : '☐'} ${fmtTime(i.start_at)} — ${i.title.slice(0, 40)}`,
      body: (T: Trad) => i.kind === 'event' ? T('Começa em breve', 'Starting soon', 'Comienza pronto') : T('Tarefa vencendo', 'Task due soon', 'Tarea por vencer'),
      url: '/dashboard/appointments',
      lead_id: null,
    })),
  ]

  if (events.length === 0) return NextResponse.json({ pushed: 0, whatsapp: 0, email: 0 })

  // Agrupar por buyer pra carregar prefs uma vez por buyer
  const byBuyer = new Map<string, UpcomingEvent[]>()
  for (const ev of events) {
    if (!byBuyer.has(ev.buyer_id)) byBuyer.set(ev.buyer_id, [])
    byBuyer.get(ev.buyer_id)!.push(ev)
  }

  // Carrega prefs + dados do buyer (whatsapp, email) + idiomas em batch
  const buyerIds = Array.from(byBuyer.keys())
  const [prefsRes, buyersRes, locales] = await Promise.all([
    db.from('notification_preferences').select('*').in('buyer_id', buyerIds),
    db.from('buyers').select('id, name, email, phone, whatsapp').in('id', buyerIds),
    localesDosBuyers(db, buyerIds),
  ])
  const prefsMap = new Map((prefsRes.data || []).map((p: any) => [p.buyer_id, p]))
  const buyerMap = new Map((buyersRes.data || []).map((b: any) => [b.id, b]))

  let pushed = 0
  let whatsapp = 0
  let email = 0

  for (const [buyerId, list] of byBuyer) {
    const prefs = (prefsMap.get(buyerId) as any) || DEFAULT_PREFS
    const buyer = (buyerMap.get(buyerId) as any) || null
    const T = trad(locales[buyerId] || 'pt')
    const pushIntervals: number[] = prefs.reminder_intervals || DEFAULT_PREFS.reminder_intervals
    const waIntervals: number[] = prefs.whatsapp_intervals || DEFAULT_PREFS.whatsapp_intervals
    const emailIntervals: number[] = prefs.email_intervals || DEFAULT_PREFS.email_intervals

    for (const ev of list) {
      const elapsed = new Date(ev.start).getTime() - nowMs
      if (elapsed <= 0) continue
      // Título e corpo já no idioma deste buyer (uma vez por evento)
      const titulo = ev.title(T)
      const corpo = ev.body(T)

      // Push do navegador
      if (prefs.push_enabled !== false) {
        for (const interval of pushIntervals) {
          if (!shouldFire(elapsed, interval)) continue
          const recorded = await tryRecord(db, ev, interval, 'push')
          if (!recorded) continue
          await pushToBuyer(buyerId, {
            title: T(`⏰ Em ${interval} min — ${titulo}`, `⏰ In ${interval} min — ${titulo}`, `⏰ En ${interval} min — ${titulo}`),
            body: corpo,
            url: ev.url,
            tag: `reminder-${ev.type}-${ev.id}-${interval}`,
          }).catch(() => {})
          pushed++
        }
      }

      // WhatsApp (pro número do próprio buyer)
      if (prefs.whatsapp_enabled === true && buyer) {
        const phone = buyer.whatsapp || buyer.phone
        if (phone) {
          for (const interval of waIntervals) {
            if (!shouldFire(elapsed, interval)) continue
            const recorded = await tryRecord(db, ev, interval, 'whatsapp')
            if (!recorded) continue
            const message = T(
              `⏰ *Lembrete Lead4Pro*\n\n${titulo}\nEm *${interval} minutos*\n\n${corpo}`,
              `⏰ *Lead4Pro Reminder*\n\n${titulo}\nIn *${interval} minutes*\n\n${corpo}`,
              `⏰ *Recordatorio Lead4Pro*\n\n${titulo}\nEn *${interval} minutos*\n\n${corpo}`
            ).trim()
            const ok = await sendWhatsApp(buyerId, phone, message, db)
            if (ok) whatsapp++
          }
        }
      }

      // Email
      if (prefs.email_enabled === true && buyer?.email) {
        for (const interval of emailIntervals) {
          if (!shouldFire(elapsed, interval)) continue
          const recorded = await tryRecord(db, ev, interval, 'email')
          if (!recorded) continue
          const html = `
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:20px;border-radius:14px 14px 0 0;">
                <h2 style="margin:0;font-size:18px;">⏰ ${titulo}</h2>
                <p style="margin:6px 0 0;opacity:.9;font-size:13px;">${T(`Em ${interval} minutos`, `In ${interval} minutes`, `En ${interval} minutos`)}</p>
              </div>
              <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;">
                <p style="margin:0 0 14px;color:#1a1a2e;font-size:14px;">${corpo}</p>
                <a href="https://lead4producers.com${ev.url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:bold;font-size:13px;">${T('Abrir agenda →', 'Open calendar →', 'Abrir agenda →')}</a>
              </div>
            </div>`
          const ok = await sendEmail(buyer.email, T(`⏰ Em ${interval} min — ${titulo}`, `⏰ In ${interval} min — ${titulo}`, `⏰ En ${interval} min — ${titulo}`), html)
          if (ok) email++
        }
      }
    }
  }

  console.log(`[Cron Reminders] push=${pushed} whatsapp=${whatsapp} email=${email}`)
  return NextResponse.json({ pushed, whatsapp, email })
}
