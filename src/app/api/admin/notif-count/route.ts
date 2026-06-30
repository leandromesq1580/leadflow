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

/** POST — marca a notificação mais recente do próprio admin como não-lida (teste do badge do menu). Reverter = abrir o sino. */
export async function POST(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const { data: latest } = await ctx.db
      .from('community_notifications')
      .select('id')
      .eq('recipient_id', ctx.me.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return NextResponse.json({ ok: false, reason: 'sem notificações pra marcar' })
    const { error } = await ctx.db.from('community_notifications').update({ read: false }).eq('id', latest.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, marcadaNaoLida: latest.id })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
