import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const path = typeof body.path === 'string' ? body.path.slice(0, 240) : ''
  if (!/^\/(dashboard|admin|m)(\/|$)/.test(path)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const { error } = await db.from('platform_access_logs').insert({
    buyer_id: caller.id,
    auth_user_id: caller.authUserId,
    event_type: 'authenticated_page_view',
    path,
    locale: typeof body.locale === 'string' ? body.locale.slice(0, 5) : null,
    ip,
    user_agent: request.headers.get('user-agent')?.slice(0, 300) || null,
  })
  if (error) {
    console.error('[Access Audit]', error.message)
    return NextResponse.json({ error: 'Audit unavailable' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
