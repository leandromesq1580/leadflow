import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_poll_votes.* does not exist|could not find the table/i

/**
 * POST /api/community/posts/[id]/vote — vota numa enquete (um voto por membro; troca o voto).
 * Body: { option_index }. Devolve { counts, myVote }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const idx = Number(body?.option_index)
    if (!Number.isInteger(idx) || idx < 0 || idx > 9) return NextResponse.json({ error: 'Opção inválida.' }, { status: 400 })

    const { error } = await db
      .from('community_poll_votes')
      .upsert({ post_id: id, buyer_id: me.id, option_index: idx }, { onConflict: 'post_id,buyer_id' })
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ error: 'A tabela de votos ainda não existe. Rode supabase/migrations/024_community_threads_polls.sql.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: votes } = await db.from('community_poll_votes').select('option_index').eq('post_id', id)
    const counts: Record<number, number> = {}
    for (const v of votes || []) counts[v.option_index] = (counts[v.option_index] || 0) + 1
    return NextResponse.json({ counts, myVote: idx })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
