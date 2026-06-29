import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

/**
 * DELETE /api/community/posts/[id] — remove um post (autor ou admin).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: post } = await db.from('community_posts').select('buyer_id').eq('id', id).single()
    if (!post) return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 })
    if (!me.isAdmin && post.buyer_id !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await db.from('community_posts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * PATCH /api/community/posts/[id] — fixar/desafixar (somente admin). Body: { pinned }.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin pode fixar.' }, { status: 403 })

    const { pinned } = await request.json()
    const { error } = await db.from('community_posts').update({ pinned: !!pinned }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, pinned: !!pinned })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
