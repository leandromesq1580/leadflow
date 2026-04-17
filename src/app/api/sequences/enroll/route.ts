import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST /api/sequences/enroll — enroll a lead into a sequence */
export async function POST(request: NextRequest) {
  try {
    const { sequence_id, lead_id, buyer_id } = await request.json()
    if (!sequence_id || !lead_id || !buyer_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data: firstStep } = await db
      .from('sequence_steps')
      .select('delay_hours')
      .eq('sequence_id', sequence_id)
      .order('step_order')
      .limit(1)
      .single()

    const nextAt = new Date(Date.now() + ((firstStep?.delay_hours || 0) * 3600_000)).toISOString()

    const { data, error } = await db.from('sequence_enrollments').insert({
      sequence_id, lead_id, buyer_id,
      current_step: 0,
      next_run_at: nextAt,
      status: 'active',
    }).select().maybeSingle()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Já está enrolled' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ enrollment: data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/** DELETE /api/sequences/enroll?enrollment_id=X — stop enrollment */
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('enrollment_id')
  if (!id) return NextResponse.json({ error: 'Missing' }, { status: 400 })
  const db = createAdminClient()
  await db.from('sequence_enrollments').update({ status: 'stopped' }).eq('id', id)
  return NextResponse.json({ success: true })
}
