import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_posts.* does not exist|could not find the table/i
const CHANNELS = ['fechamento', 'follow_up', 'vitorias', 'geral']
const KINDS = ['sacada', 'win', 'post']

function sanitizeWin(data: any) {
  const out: Record<string, any> = {}
  const v = Number(data?.sale_value)
  if (Number.isFinite(v) && v > 0) out.sale_value = Math.round(v)
  const d = Number(data?.lead_age_days)
  if (Number.isFinite(d) && d >= 0) out.lead_age_days = Math.round(d)
  if (typeof data?.product === 'string' && data.product.trim()) out.product = data.product.trim().slice(0, 60)
  return out
}

/**
 * GET /api/community/posts?channel=  — feed da comunidade (fixados primeiro).
 * Devolve { allowed, me, posts[] } com contagem de reações/comentários e flags.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ allowed: false, me })

    const channel = request.nextUrl.searchParams.get('channel')
    let q = db
      .from('community_posts')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)
    if (channel && CHANNELS.includes(channel)) q = q.eq('channel', channel)

    const { data: posts, error } = await q
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ allowed: true, me, posts: [], needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (posts || []).map(p => p.id)
    let reactions: any[] = []
    let comments: any[] = []
    if (ids.length) {
      const [rx, cm] = await Promise.all([
        db.from('community_reactions').select('post_id, buyer_id').in('post_id', ids),
        db.from('community_comments').select('post_id').in('post_id', ids),
      ])
      reactions = rx.data || []
      comments = cm.data || []
    }

    const enriched = (posts || []).map(p => ({
      ...p,
      reaction_count: reactions.filter(r => r.post_id === p.id).length,
      reacted: reactions.some(r => r.post_id === p.id && r.buyer_id === me.id),
      comment_count: comments.filter(c => c.post_id === p.id).length,
      can_delete: me.isAdmin || p.buyer_id === me.id,
    }))

    return NextResponse.json({ allowed: true, me, posts: enriched })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/posts — cria post. Autor = buyer da sessão (não confia no client).
 * Body: { kind, channel, title, body, data }. 'sacada' só admin. 'win' → canal vitórias.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros pagantes podem postar.' }, { status: 403 })

    const body = await request.json()
    const kind = KINDS.includes(body?.kind) ? body.kind : 'post'
    if (kind === 'sacada' && !me.isAdmin) {
      return NextResponse.json({ error: 'Apenas o admin pode publicar uma Sacada.' }, { status: 403 })
    }

    let channel = kind === 'win' ? 'vitorias' : body?.channel
    if (!CHANNELS.includes(channel)) channel = 'geral'

    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 4000) : ''
    const data = kind === 'win' ? sanitizeWin(body?.data) : {}
    if (kind !== 'win' && !text) {
      return NextResponse.json({ error: 'Escreva algo antes de publicar.' }, { status: 400 })
    }
    if (kind === 'win' && !text && !Object.keys(data).length) {
      return NextResponse.json({ error: 'Conte algo sobre a venda.' }, { status: 400 })
    }

    const { data: row, error } = await db
      .from('community_posts')
      .insert({
        buyer_id: me.id,
        author_name: me.name,
        kind,
        channel,
        title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 140) : null,
        body: text || null,
        data,
        pinned: false,
      })
      .select()
      .single()
    if (error) {
      if (MISSING_TABLE.test(error.message)) {
        return NextResponse.json({ error: 'A tabela community_posts ainda não existe. Rode supabase/migrations/022_community.sql no Supabase.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ post: { ...row, reaction_count: 0, reacted: false, comment_count: 0, can_delete: true } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
