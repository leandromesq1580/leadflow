import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext, notifyCommunity, notifyMentions } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_comments.* does not exist|could not find the table/i

/**
 * GET /api/community/posts/[id]/comments — comentários do post (mais antigos primeiro).
 * select('*') pra não quebrar se a coluna parent_id (migration 024) ainda não existir.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await db
      .from('community_comments')
      .select('*')
      .eq('post_id', id)
      .order('created_at', { ascending: true })
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ comments: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const comments = (data || []).map(c => ({
      id: c.id, buyer_id: c.buyer_id, author_name: c.author_name, body: c.body,
      created_at: c.created_at, parent_id: c.parent_id ?? null,
      can_delete: me.isAdmin || c.buyer_id === me.id,
    }))
    return NextResponse.json({ comments })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/posts/[id]/comments — comenta (ou responde, com parent_id). Autor = sessão.
 * Body: { body, parent_id? }. Notifica autor do post (ou do comentário-pai) + menções @Nome.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros pagantes podem comentar.' }, { status: 403 })

    const body = await request.json()
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : ''
    if (!text) return NextResponse.json({ error: 'Comentário vazio.' }, { status: 400 })
    const parentId = typeof body?.parent_id === 'string' && body.parent_id ? body.parent_id : null

    const insertObj: Record<string, any> = { post_id: id, buyer_id: me.id, author_name: me.name, body: text }
    if (parentId) insertObj.parent_id = parentId

    const { data: row, error } = await db.from('community_comments').insert(insertObj).select('*').single()
    if (error) {
      if (MISSING_TABLE.test(error.message)) {
        return NextResponse.json({ error: 'A tabela community_comments ainda não existe. Rode supabase/migrations/022_community.sql.' }, { status: 503 })
      }
      if (/parent_id/.test(error.message)) {
        return NextResponse.json({ error: 'Responder comentário precisa da migration 024 (supabase/migrations/024_community_threads_polls.sql).' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // notifica: se é resposta, o autor do comentário-pai; senão o autor do post
    if (parentId) {
      const { data: parent } = await db.from('community_comments').select('buyer_id').eq('id', parentId).single()
      await notifyCommunity(db, { recipientId: parent?.buyer_id, actorId: me.id, actorName: me.name, type: 'comment', postId: id, preview: text })
    } else {
      const { data: post } = await db.from('community_posts').select('buyer_id').eq('id', id).single()
      await notifyCommunity(db, { recipientId: post?.buyer_id, actorId: me.id, actorName: me.name, type: 'comment', postId: id, preview: text })
    }
    await notifyMentions(db, { body: text, actorId: me.id, actorName: me.name, postId: id })

    return NextResponse.json({ comment: { id: row.id, buyer_id: row.buyer_id, author_name: row.author_name, body: row.body, created_at: row.created_at, parent_id: row.parent_id ?? null, can_delete: true } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/community/posts/[id]/comments — remove um comentário (autor ou admin). Body: { comment_id }.
 * Apaga também as respostas (parent_id cascade na migration 024).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { comment_id } = await request.json().catch(() => ({}))
    if (!comment_id) return NextResponse.json({ error: 'Missing comment_id' }, { status: 400 })

    const { data: c } = await db.from('community_comments').select('buyer_id').eq('id', comment_id).eq('post_id', id).single()
    if (!c) return NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404 })
    if (!me.isAdmin && c.buyer_id !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await db.from('community_comments').delete().eq('id', comment_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
