import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data: sequences } = await db
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })

  // Sort steps
  const list = (sequences || []).map(s => ({
    ...s,
    sequence_steps: (s.sequence_steps || []).sort((a: any, b: any) => a.step_order - b.step_order),
  }))

  return NextResponse.json({ sequences: list })
}

export async function POST(request: NextRequest) {
  try {
    const { buyer_id, name, description, steps } = await request.json()
    if (!buyer_id || !name || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data: seq, error } = await db.from('sequences').insert({
      buyer_id, name, description: description || null, enabled: true,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const stepRows = steps.map((s: any, i: number) => ({
      sequence_id: seq.id,
      step_order: i,
      delay_hours: Number(s.delay_hours) || 0,
      template_id: s.template_id || null,
      custom_body: s.custom_body || null,
      step_type: s.step_type || 'send_template',
    }))
    await db.from('sequence_steps').insert(stepRows)

    return NextResponse.json({ sequence: seq })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
