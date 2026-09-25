import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { POST as saveSettings } from '@/app/api/settings/route'

/** Admin recovery uses the same validated, atomic writer as self-service settings. */
export async function POST(request: NextRequest) {
  const caller = await callerBuyer(createAdminClient())
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return saveSettings(request)
}
