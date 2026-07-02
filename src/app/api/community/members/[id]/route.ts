import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

/**
 * GET /api/community/members/[id] — perfil público (na comunidade) de um membro:
 * nome, stats (nº posts, vitórias, total vendido no mês corrente não — total geral) e os posts dele.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Perfil com bio/foto (migration 028); se as colunas ainda não existem, cai no básico.
    let buyer: any = null
    {
      const r1 = await db.from('buyers').select('id, name, community_bio, community_avatar_path').eq('id', id).single()
      buyer = r1.data
      if (!buyer && r1.error) {
        const r2 = await db.from('buyers').select('id, name').eq('id', id).single()
        buyer = r2.data
      }
    }
    const { data: posts } = await db
      .from('community_posts')
      .select('id, kind, channel, body, data, created_at')
      .eq('buyer_id', id)
      .order('created_at', { ascending: false })
      .limit(30)

    const list = posts || []
    let wins = 0
    let salesTotal = 0
    for (const p of list) {
      if (p.kind === 'win') {
        wins++
        const v = Number(p.data?.sale_value)
        if (Number.isFinite(v) && v > 0) salesTotal += v
      }
    }
    let banned = false
    try {
      const { data: ban } = await db.from('community_bans').select('buyer_id').eq('buyer_id', id).maybeSingle()
      banned = !!ban
    } catch {}

    return NextResponse.json({
      id,
      name: buyer?.name || 'Membro',
      bio: buyer?.community_bio || null,
      avatar_path: buyer?.community_avatar_path || null,
      banned,
      stats: { posts: list.length, wins, salesTotal },
      posts: list,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
