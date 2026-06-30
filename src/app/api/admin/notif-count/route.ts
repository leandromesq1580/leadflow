import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

/** GET /api/admin/notif-count?type=aviso — quantas notificações da comunidade existem (por tipo). Admin. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const type = request.nextUrl.searchParams.get('type')
    let q = ctx.db.from('community_notifications').select('id', { count: 'exact', head: true })
    if (type) q = q.eq('type', type)
    const { count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ type: type || 'todas', count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
