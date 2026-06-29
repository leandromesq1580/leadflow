import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_posts.* does not exist|could not find the table/i

/**
 * GET /api/community/ranking — Top fechadores do mês corrente, agregando os posts de
 * vitória (kind='win'): nº de vendas + valor total. Ordena por nº de vendas, depois valor.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, allowed } = ctx
    if (!allowed) return NextResponse.json({ top: [] })

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data, error } = await db
      .from('community_posts')
      .select('buyer_id, author_name, data')
      .eq('kind', 'win')
      .gte('created_at', start)
      .limit(1000)
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ top: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const agg = new Map<string, { buyer_id: string; name: string; count: number; total: number }>()
    for (const p of data || []) {
      const id = p.buyer_id || 'anon'
      const cur = agg.get(id) || { buyer_id: id, name: p.author_name || 'Membro', count: 0, total: 0 }
      cur.count += 1
      const v = Number(p.data?.sale_value)
      if (Number.isFinite(v) && v > 0) cur.total += v
      agg.set(id, cur)
    }
    const top = [...agg.values()].sort((a, b) => (b.count - a.count) || (b.total - a.total)).slice(0, 8)
    return NextResponse.json({ top })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
