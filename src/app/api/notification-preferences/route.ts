import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULTS = {
  reminder_intervals: [60, 15, 5],
  push_enabled: true,
  banner_enabled: true,
  sound_enabled: true,
  sound_volume: 70,
  sound_file: 'chime' as const,
  whatsapp_enabled: false,
  whatsapp_intervals: [30],
  email_enabled: false,
  email_intervals: [60],
}

const VALID_SOUND = new Set(['alarm', 'chime', 'bell'])

function sanitizeIntervals(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null
  const out = input
    .map(v => Number(v))
    .filter(n => Number.isFinite(n) && n > 0 && n <= 1440)
    .map(n => Math.round(n))
  return Array.from(new Set(out)).sort((a, b) => b - a)
}

export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data } = await db.from('notification_preferences').select('*').eq('buyer_id', buyerId).maybeSingle()
  if (data) return NextResponse.json(data)

  // Lazy create with defaults
  const { data: created, error } = await db.from('notification_preferences')
    .insert({ buyer_id: buyerId, ...DEFAULTS })
    .select('*')
    .single()
  if (error) {
    // Tabela pode nao existir ainda — devolve defaults inline (não quebra a UI)
    return NextResponse.json({ buyer_id: buyerId, ...DEFAULTS, _ephemeral: true })
  }
  return NextResponse.json(created)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_id } = body
    if (!buyer_id) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

    const update: Record<string, unknown> = {}

    if (body.reminder_intervals !== undefined) {
      const v = sanitizeIntervals(body.reminder_intervals)
      if (!v || v.length === 0) return NextResponse.json({ error: 'reminder_intervals inválido' }, { status: 400 })
      update.reminder_intervals = v
    }
    if (body.whatsapp_intervals !== undefined) {
      const v = sanitizeIntervals(body.whatsapp_intervals)
      update.whatsapp_intervals = v && v.length > 0 ? v : [30]
    }
    if (body.email_intervals !== undefined) {
      const v = sanitizeIntervals(body.email_intervals)
      update.email_intervals = v && v.length > 0 ? v : [60]
    }
    if (typeof body.push_enabled === 'boolean') update.push_enabled = body.push_enabled
    if (typeof body.banner_enabled === 'boolean') update.banner_enabled = body.banner_enabled
    if (typeof body.sound_enabled === 'boolean') update.sound_enabled = body.sound_enabled
    if (typeof body.whatsapp_enabled === 'boolean') update.whatsapp_enabled = body.whatsapp_enabled
    if (typeof body.email_enabled === 'boolean') update.email_enabled = body.email_enabled
    if (Number.isFinite(body.sound_volume)) {
      update.sound_volume = Math.max(0, Math.min(100, Math.round(Number(body.sound_volume))))
    }
    if (typeof body.sound_file === 'string' && VALID_SOUND.has(body.sound_file)) {
      update.sound_file = body.sound_file
    }

    const db = createAdminClient()
    const { data, error } = await db.from('notification_preferences')
      .upsert({ buyer_id, ...DEFAULTS, ...update }, { onConflict: 'buyer_id' })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
