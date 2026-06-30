import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_notifications.* does not exist|could not find the table/i

/**
 * GET /api/community/notifications — minhas notificações (recentes) + contagem de não lidas.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ items: [], unread: 0 })

    // Modo leve: só a contagem de não-lidas (usado pelo badge do menu lateral).
    if (request.nextUrl.searchParams.get('count') === '1') {
      const { count, error } = await db
        .from('community_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', me.id)
        .eq('read', false)
      if (error) {
        if (MISSING_TABLE.test(error.message)) return NextResponse.json({ unread: 0, needsMigration: true })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ unread: count || 0 })
    }

    const { data, error } = await db
      .from('community_notifications')
      .select('id, actor_name, type, post_id, preview, read, created_at')
      .eq('recipient_id', me.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ items: [], unread: 0, needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const items = data || []
    const unread = items.filter(n => !n.read).length
    return NextResponse.json({ items, unread })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/notifications/read — marca como lidas (todas, ou as do body.ids).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    let q = db.from('community_notifications').update({ read: true }).eq('recipient_id', me.id).eq('read', false)
    if (Array.isArray(body?.ids) && body.ids.length) q = q.in('id', body.ids)
    const { error } = await q
    if (error && !MISSING_TABLE.test(error.message)) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
