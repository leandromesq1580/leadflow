import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext, notifyCommunity } from '@/lib/community-access'

const KINDS = ['like', 'fire', 'clap', 'party']

/**
 * POST /api/community/posts/[id]/react — alterna uma reação (emoji) do membro no post.
 * Body: { kind } (like|fire|clap|party, default like). Devolve { kind, reacted, count }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const kind = KINDS.includes(body?.kind) ? body.kind : 'like'

    const { data: existing } = await db
      .from('community_reactions')
      .select('id')
      .eq('post_id', id)
      .eq('buyer_id', me.id)
      .eq('kind', kind)
      .maybeSingle()

    let reacted: boolean
    if (existing) {
      await db.from('community_reactions').delete().eq('id', existing.id)
      reacted = false
    } else {
      const { error } = await db.from('community_reactions').insert({ post_id: id, buyer_id: me.id, kind })
      if (error && !/duplicate key/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      reacted = true
    }

    if (reacted) {
      const { data: post } = await db.from('community_posts').select('buyer_id').eq('id', id).single()
      await notifyCommunity(db, { recipientId: post?.buyer_id, actorId: me.id, actorName: me.name, type: 'reaction', postId: id })
    }

    const { count, error: cErr } = await db
      .from('community_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', id)
      .eq('kind', kind)

    // Se a recontagem falhar, devolve só 'reacted' — o client mantém o estado otimista.
    if (cErr) return NextResponse.json({ kind, reacted })
    return NextResponse.json({ kind, reacted, count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
