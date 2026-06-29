import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

/**
 * POST /api/community/posts/[id]/react — alterna o "curtir" do membro no post.
 * Devolve { reacted, count }.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: existing } = await db
      .from('community_reactions')
      .select('id')
      .eq('post_id', id)
      .eq('buyer_id', me.id)
      .eq('kind', 'like')
      .maybeSingle()

    let reacted: boolean
    if (existing) {
      await db.from('community_reactions').delete().eq('id', existing.id)
      reacted = false
    } else {
      const { error } = await db.from('community_reactions').insert({ post_id: id, buyer_id: me.id, kind: 'like' })
      if (error && !/duplicate key/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      reacted = true
    }

    const { count } = await db
      .from('community_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', id)
      .eq('kind', 'like')

    return NextResponse.json({ reacted, count: count || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
