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
 * PATCH /api/community/posts/[id] — fixar (admin) OU editar texto/título (autor ou admin).
 * Body: { pinned } (admin) | { body?, title? } (autor/admin).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))

    // fixar/desafixar — somente admin
    if (typeof body?.pinned === 'boolean') {
      if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin pode fixar.' }, { status: 403 })
      const { error } = await db.from('community_posts').update({ pinned: body.pinned }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, pinned: body.pinned })
    }

    // editar texto/título — autor ou admin
    if (typeof body?.body === 'string' || typeof body?.title === 'string') {
      const { data: post } = await db.from('community_posts').select('buyer_id').eq('id', id).single()
      if (!post) return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 })
      if (!me.isAdmin && post.buyer_id !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const patch: Record<string, any> = {}
      if (typeof body.body === 'string') patch.body = body.body.trim().slice(0, 4000) || null
      if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 140) || null
      const { error } = await db.from('community_posts').update(patch).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Nada pra atualizar.' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
