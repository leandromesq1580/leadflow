import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { buyer_id, endpoint, p256dh, auth, user_agent } = await request.json()
    if (!buyer_id || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    await db.from('push_subscriptions').upsert({
      buyer_id, endpoint, p256dh, auth, user_agent: user_agent || null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const endpoint = new URL(request.url).searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  const db = createAdminClient()
  await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ success: true })
}
