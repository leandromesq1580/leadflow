import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function genReferralCode(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * POST /api/auth/register
 * Create buyer record after auth signup (uses service role to bypass RLS)
 */
export async function POST(request: NextRequest) {
  try {
    const { auth_user_id, email, name, phone, referral_code } = await request.json()

    if (!auth_user_id || !email || !name) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Check if buyer already exists
    const { data: existing } = await supabase
      .from('buyers')
      .select('id')
      .eq('auth_user_id', auth_user_id)
      .single()

    if (existing) {
      return NextResponse.json({ buyer: existing })
    }

    // Resolve referrer from code
    let referredBy: string | null = null
    if (referral_code) {
      const { data: referrer } = await supabase
        .from('buyers')
        .select('id')
        .eq('referral_code', referral_code.toLowerCase().trim())
        .single()
      if (referrer) referredBy = referrer.id
    }

    // Generate unique referral code for this buyer
    let myCode = genReferralCode()
    for (let i = 0; i < 3; i++) {
      const { data: conflict } = await supabase.from('buyers').select('id').eq('referral_code', myCode).maybeSingle()
      if (!conflict) break
      myCode = genReferralCode()
    }

    // Create buyer record with service role (bypasses RLS)
    const { data, error } = await supabase
      .from('buyers')
      .insert({
        auth_user_id,
        email,
        name,
        phone: phone || null,
        referral_code: myCode,
        referred_by: referredBy,
      })
      .select()
      .single()

    if (error) {
      console.error('[Register] Failed to create buyer:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Track signup (no credit yet — credit triggers on first purchase / subscription)
    if (referredBy && data) {
      await supabase.from('referral_rewards').insert({
        referrer_buyer_id: referredBy,
        referred_buyer_id: data.id,
        trigger_event: 'signup',
        reward_cents: 0,
      }).select().maybeSingle()
    }

    // Auto-link: if this email exists as team_member somewhere, set auth_user_id
    await supabase
      .from('team_members')
      .update({ auth_user_id })
      .eq('email', email)
      .is('auth_user_id', null)

    return NextResponse.json({ buyer: data })
  } catch (error) {
    console.error('[Register] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
