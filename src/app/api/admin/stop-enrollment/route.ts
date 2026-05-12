import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/stop-enrollment?secret=X&enrollment_id=Y
 * Marca enrollment como status='stopped'. Util pra quebrar loops infinitos
 * (ex: lead sem WhatsApp + erro permanente reagendando em loop).
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = url.searchParams.get('enrollment_id')
  if (!id) return NextResponse.json({ error: 'Missing enrollment_id' }, { status: 400 })

  const db = createAdminClient()
  const { data: before } = await db.from('sequence_enrollments').select('id, status, lead_id, sequence_id').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.from('sequence_enrollments')
    .update({ status: 'stopped', completed_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ stopped: id, prev_status: before.status })
}
