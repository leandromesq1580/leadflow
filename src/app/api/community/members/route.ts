import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

/**
 * GET /api/community/members — lista dos integrantes da comunidade (membros pagantes:
 * assinatura ativa OU já comprou), com foto/bio. Exclui banidos e contas suspensas.
 * Admins aparecem primeiro, depois ordem alfabética.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Colunas de perfil são da migration 028 — cai no básico se ainda não existirem.
    let buyers: any[] | null = null
    {
      const r1 = await db.from('buyers')
        .select('id, name, is_admin, is_active, crm_subscription_status, community_bio, community_avatar_path')
        .limit(5000)
      buyers = r1.data
      if (!buyers && r1.error) {
        const r2 = await db.from('buyers').select('id, name, is_admin, is_active, crm_subscription_status').limit(5000)
        buyers = r2.data
      }
    }

    const [pays, creds, bans] = await Promise.all([
      db.from('payments').select('buyer_id').eq('status', 'completed'),
      db.from('credits').select('buyer_id, stripe_payment_id').limit(20000),
      db.from('community_bans').select('buyer_id'),
    ])
    const purchased = new Set<string>((pays.data || []).map((p: any) => p.buyer_id))
    for (const c of creds.data || []) {
      const sid = c.stripe_payment_id ? String(c.stripe_payment_id) : ''
      if (sid && !sid.startsWith('manual:')) purchased.add(c.buyer_id)
    }
    const banned = new Set<string>((bans.data || []).map((b: any) => b.buyer_id))

    const members = (buyers || [])
      .filter(b => b.is_active !== false && !banned.has(b.id))
      .filter(b => b.is_admin || b.crm_subscription_status === 'active' || purchased.has(b.id))
      .map(b => ({
        id: b.id,
        name: (b.name || 'Membro').trim(),
        isAdmin: !!b.is_admin,
        bio: b.community_bio || null,
        avatar_path: b.community_avatar_path || null,
      }))
      .sort((a, b) => (Number(b.isAdmin) - Number(a.isAdmin)) || a.name.localeCompare(b.name, 'pt'))

    return NextResponse.json({ members, total: members.length, me: me.id })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
