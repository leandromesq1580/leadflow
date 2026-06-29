import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext, notifyMentions } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_posts.* does not exist|could not find the table/i
const CHANNELS = ['fechamento', 'follow_up', 'vitorias', 'geral']
const KINDS = ['sacada', 'win', 'post', 'poll']

function sanitizeWin(data: any) {
  const out: Record<string, any> = {}
  const v = Number(data?.sale_value)
  if (Number.isFinite(v) && v > 0) out.sale_value = Math.round(v)
  const d = Number(data?.lead_age_days)
  if (Number.isFinite(d) && d >= 0) out.lead_age_days = Math.round(d)
  if (typeof data?.product === 'string' && data.product.trim()) out.product = data.product.trim().slice(0, 60)
  return out
}

function sanitizePoll(data: any) {
  const raw = Array.isArray(data?.poll?.options) ? data.poll.options : []
  const options = raw
    .map((o: any) => (typeof o === 'string' ? o.trim().slice(0, 80) : ''))
    .filter((o: string) => o)
    .slice(0, 4)
  if (options.length < 2) return null
  return { options }
}

/**
 * GET /api/community/posts?channel=  — feed da comunidade (fixados primeiro).
 * Devolve posts com reações por emoji, minhas reações, contagem de comentários e (em enquetes) votos.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ allowed: false, me })

    const sp = request.nextUrl.searchParams
    const channel = sp.get('channel')
    const sort = sp.get('sort') === 'top' ? 'top' : 'recent'
    const search = (sp.get('q') || '').replace(/[,()*]/g, ' ').trim().slice(0, 80)
    let q = db
      .from('community_posts')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60)
    if (channel && CHANNELS.includes(channel)) q = q.eq('channel', channel)
    if (search) q = q.or(`body.ilike.*${search}*,title.ilike.*${search}*,author_name.ilike.*${search}*`)

    const { data: posts, error } = await q
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ allowed: true, me, posts: [], needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (posts || []).map(p => p.id)
    const reactionsByPost: Record<string, Record<string, number>> = {}
    const myReactionsByPost: Record<string, string[]> = {}
    const cmCount: Record<string, number> = {}
    const pollVotesByPost: Record<string, Record<number, number>> = {}
    const myPollVote: Record<string, number> = {}
    if (ids.length) {
      // Reações em linhas (precisa do kind por emoji); comentários por COUNT no banco; votos das enquetes.
      // Em escala muito alta, trocar o fetch de reações por uma RPC/view agregada (cap de 1000 do PostgREST).
      const pollIds = (posts || []).filter(p => p.kind === 'poll').map(p => p.id)
      const [rx, comments, votes] = await Promise.all([
        db.from('community_reactions').select('post_id, buyer_id, kind').in('post_id', ids),
        Promise.all(ids.map(async (id) => {
          const { count } = await db.from('community_comments').select('id', { count: 'exact', head: true }).eq('post_id', id)
          return { id, count: count || 0 }
        })),
        pollIds.length
          ? db.from('community_poll_votes').select('post_id, buyer_id, option_index').in('post_id', pollIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      for (const r of (rx.data || [])) {
        const pid = r.post_id as string
        if (!reactionsByPost[pid]) reactionsByPost[pid] = {}
        reactionsByPost[pid][r.kind] = (reactionsByPost[pid][r.kind] || 0) + 1
        if (r.buyer_id === me.id) {
          if (!myReactionsByPost[pid]) myReactionsByPost[pid] = []
          myReactionsByPost[pid].push(r.kind)
        }
      }
      for (const c of comments) cmCount[c.id] = c.count
      for (const v of ((votes as any)?.data || [])) {
        const pid = v.post_id as string
        if (!pollVotesByPost[pid]) pollVotesByPost[pid] = {}
        pollVotesByPost[pid][v.option_index] = (pollVotesByPost[pid][v.option_index] || 0) + 1
        if (v.buyer_id === me.id) myPollVote[pid] = v.option_index
      }
    }

    const enriched = (posts || []).map(p => {
      const reactions = reactionsByPost[p.id] || {}
      const total = Object.values(reactions).reduce((a, b) => a + b, 0)
      const mine = myReactionsByPost[p.id] || []
      return {
        ...p,
        reactions,
        my_reactions: mine,
        reaction_count: total,
        reacted: mine.length > 0,
        comment_count: cmCount[p.id] || 0,
        poll_counts: pollVotesByPost[p.id] || {},
        my_poll_vote: p.id in myPollVote ? myPollVote[p.id] : null,
        can_delete: me.isAdmin || p.buyer_id === me.id,
      }
    })

    let result = enriched
    if (sort === 'top') {
      result = [...enriched].sort((a, b) =>
        (Number(b.pinned) - Number(a.pinned)) ||
        ((b.reaction_count + b.comment_count) - (a.reaction_count + a.comment_count)) ||
        (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    }

    return NextResponse.json({ allowed: true, me, posts: result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/posts — cria post. Autor = buyer da sessão (não confia no client).
 * Body: { kind, channel, title, body, data }. 'sacada' só admin. 'win' → vitórias. 'poll' → enquete.
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
    const imagePath = typeof body?.data?.image_path === 'string' && body.data.image_path.startsWith('community/')
      ? body.data.image_path.slice(0, 300) : undefined
    const data: Record<string, any> = kind === 'win' ? sanitizeWin(body?.data) : {}
    if (imagePath) data.image_path = imagePath

    let poll = null
    if (kind === 'poll') {
      poll = sanitizePoll(body?.data)
      if (!poll) return NextResponse.json({ error: 'A enquete precisa de pelo menos 2 opções.' }, { status: 400 })
      data.poll = poll
    }

    const hasContent = !!text || !!imagePath || (kind === 'win' && !!data.sale_value) || (kind === 'poll' && !!poll)
    if (!hasContent) {
      return NextResponse.json({ error: kind === 'win' ? 'Informe o valor da venda, escreva algo, ou anexe uma imagem.' : 'Escreva algo ou anexe uma imagem.' }, { status: 400 })
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
      if (/check constraint|kind_check/i.test(error.message)) {
        return NextResponse.json({ error: 'Enquetes precisam da migration 024 (supabase/migrations/024_community_threads_polls.sql).' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await notifyMentions(db, { body: text, actorId: me.id, actorName: me.name, postId: row.id })

    return NextResponse.json({ post: { ...row, reactions: {}, my_reactions: [], reaction_count: 0, reacted: false, comment_count: 0, poll_counts: {}, my_poll_vote: null, can_delete: true } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
