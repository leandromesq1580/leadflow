import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING = /relation .*community_bans.* does not exist|could not find the table/i

/**
 * POST /api/community/members/[id]/ban — bloqueia o membro da comunidade (somente admin).
 * Body opcional: { reason }. Não dá pra bloquear você mesmo nem outro admin.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin pode bloquear.' }, { status: 403 })
    if (id === me.id) return NextResponse.json({ error: 'Não dá pra bloquear você mesmo.' }, { status: 400 })

    const { data: target } = await db.from('buyers').select('is_admin').eq('id', id).single()
    if (target?.is_admin) return NextResponse.json({ error: 'Não dá pra bloquear um admin.' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const { error } = await db
      .from('community_bans')
      .upsert({ buyer_id: id, banned_by: me.id, reason: body?.reason || null }, { onConflict: 'buyer_id' })
    if (error) {
      if (MISSING.test(error.message)) return NextResponse.json({ error: 'Rode supabase/migrations/026_community_bans.sql.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, banned: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/community/members/[id]/ban — desbloqueia o membro (somente admin).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })

    const { error } = await db.from('community_bans').delete().eq('buyer_id', id)
    if (error && !MISSING.test(error.message)) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, banned: false })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
