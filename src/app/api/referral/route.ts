import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/referral?buyer_id=X — summary of rewards + referred users */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()

  const { data: buyer } = await db
    .from('buyers')
    .select('referral_code, referral_credit_cents')
    .eq('id', buyerId)
    .single()

  if (!buyer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let rewards: any[] = []
  try {
    const { data } = await db
      .from('referral_rewards')
      .select('trigger_event, reward_cents, granted_at, status, available_at, note, referred_buyer_id, buyers:referred_buyer_id(name, email)')
      .eq('referrer_buyer_id', buyerId)
      .order('granted_at', { ascending: false })
    rewards = data || []
  } catch {
    const { data } = await db
      .from('referral_rewards')
      .select('trigger_event, reward_cents, granted_at, referred_buyer_id, buyers:referred_buyer_id(name, email)')
      .eq('referrer_buyer_id', buyerId)
      .order('granted_at', { ascending: false })
    rewards = data || []
  }

  const { count: totalReferrals } = await db
    .from('buyers')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', buyerId)

  const rewardsList = (rewards || []).map((r: any) => ({
    trigger: r.trigger_event,
    cents: r.reward_cents,
    granted_at: r.granted_at,
    status: r.status || 'available',
    available_at: r.available_at || null,
    note: r.note || null,
    name: r.buyers?.name || 'Anônimo',
    email: r.buyers?.email || '',
  }))
  // Saldo em 3 estados (regra 2026-07-30): pendente (carência) / disponível / usado
  const pendingCents = rewardsList.filter(r => r.status === 'pending').reduce((s, r) => s + (r.cents || 0), 0)

  return NextResponse.json({
    code: buyer.referral_code,
    credit_cents: buyer.referral_credit_cents || 0,
    pending_cents: pendingCents,
    rules: { carenciaDias: 14, tetoMesCents: 30000, maxDescontoPct: 50 },
    total_referrals: totalReferrals || 0,
    rewards: rewardsList,
  })
}
