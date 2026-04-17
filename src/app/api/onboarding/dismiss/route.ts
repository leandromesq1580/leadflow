import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST /api/onboarding/dismiss — Mark onboarding as completed or dismissed */
export async function POST(request: NextRequest) {
  const { auth_user_id, dismissed, completed } = await request.json()
  if (!auth_user_id) return NextResponse.json({ error: 'Missing auth_user_id' }, { status: 400 })

  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (completed) update.onboarding_completed_at = new Date().toISOString()
  if (dismissed !== undefined) update.onboarding_dismissed = dismissed

  await db.from('buyers').update(update).eq('auth_user_id', auth_user_id)

  return NextResponse.json({ success: true })
}
