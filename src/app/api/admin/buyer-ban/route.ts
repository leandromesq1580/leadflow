import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

// Ferramenta admin pra BANIR/REATIVAR um cliente no sistema inteiro (anti-fraude).
// Ban = is_active=false (bloqueia plataforma + checkout) + auth ban (bloqueia login)
//       + community ban. Tudo reversível (suspend:false reverte os 3).
// GET ?email= -> acha o(s) buyer(s) pra confirmar antes. POST -> aplica.

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const email = (request.nextUrl.searchParams.get('email') || '').trim()
    if (!email) return NextResponse.json({ error: 'email obrigatório' }, { status: 400 })
    const { data } = await ctx.db
      .from('buyers')
      .select('id, name, email, is_active, is_admin, crm_plan, crm_subscription_status')
      .ilike('email', `%${email}%`)
      .limit(10)
    return NextResponse.json({ matches: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const { db, me } = ctx

    const body = await request.json().catch(() => ({}))
    const buyerId = String(body?.buyerId || '')
    const suspend = body?.suspend !== false // default: banir
    if (!buyerId) return NextResponse.json({ error: 'buyerId obrigatório' }, { status: 400 })

    const { data: buyer } = await db.from('buyers').select('id, name, email, is_admin, auth_user_id').eq('id', buyerId).single()
    if (!buyer) return NextResponse.json({ error: 'Buyer não encontrado.' }, { status: 404 })
    if (buyer.is_admin) return NextResponse.json({ error: 'Não dá pra banir um admin.' }, { status: 400 })

    const result: Record<string, any> = { id: buyer.id, name: buyer.name, email: buyer.email, suspend }

    // 1) is_active -> bloqueia a plataforma inteira (SuspendedAccount) e o checkout
    const { error: e1 } = await db.from('buyers').update({ is_active: !suspend }).eq('id', buyerId)
    result.is_active = e1 ? `erro: ${e1.message}` : !suspend

    // 2) auth ban -> bloqueia o LOGIN (Supabase auth)
    if (buyer.auth_user_id) {
      try {
        await (db.auth as any).admin.updateUserById(buyer.auth_user_id, { ban_duration: suspend ? '876000h' : 'none' })
        result.login = suspend ? 'BLOQUEADO' : 'liberado'
      } catch (e: any) {
        result.login = `erro: ${e?.message || e}`
      }
    } else {
      result.login = 'sem auth_user_id (só is_active aplicado)'
    }

    // 3) community ban (gracioso se a tabela não existir)
    try {
      if (suspend) await db.from('community_bans').upsert({ buyer_id: buyerId, banned_by: me.id, reason: 'fraude' }, { onConflict: 'buyer_id' })
      else await db.from('community_bans').delete().eq('buyer_id', buyerId)
      result.community = suspend ? 'bloqueado' : 'liberado'
    } catch {
      result.community = 'skip'
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
