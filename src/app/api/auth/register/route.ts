import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/register
 * Create buyer record after auth signup (uses service role to bypass RLS)
 */
export async function POST(request: NextRequest) {
  try {
    const { auth_user_id, email, name, phone } = await request.json()

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

    // Create buyer record with service role (bypasses RLS)
    const { data, error } = await supabase
      .from('buyers')
      .insert({
        auth_user_id,
        email,
        name,
        phone: phone || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Register] Failed to create buyer:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
