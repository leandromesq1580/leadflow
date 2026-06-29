import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_comments.* does not exist|could not find the table/i

/**
 * GET /api/community/posts/[id]/comments — comentários do post (mais antigos primeiro).
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
      .select('id, buyer_id, author_name, body, created_at')
      .eq('post_id', id)
      .order('created_at', { ascending: true })
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ comments: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const comments = (data || []).map(c => ({ ...c, can_delete: me.isAdmin || c.buyer_id === me.id }))
    return NextResponse.json({ comments })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/posts/[id]/comments — comenta. Autor = buyer da sessão.
 * Body: { body }.
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

    const { data: row, error } = await db
      .from('community_comments')
      .insert({ post_id: id, buyer_id: me.id, author_name: me.name, body: text })
      .select('id, buyer_id, author_name, body, created_at')
      .single()
    if (error) {
      if (MISSING_TABLE.test(error.message)) {
        return NextResponse.json({ error: 'A tabela community_comments ainda não existe. Rode supabase/migrations/022_community.sql.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ comment: { ...row, can_delete: true } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
