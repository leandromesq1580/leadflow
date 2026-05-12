import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/set-crm-plan-by-email?secret=X
 * Body: { email: string, plan: 'pro'|'free' }
 *
 * Liga/desliga CRM Pro de um buyer identificado por email.
 * Equivalente ao /api/admin/buyers/[id]/toggle-crm mas usa POLL_SECRET
 * em vez de sessao auth (pra chamar via curl).
 */
export async function POST(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, plan } = await request.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  if (plan !== 'pro' && plan !== 'free') {
    return NextResponse.json({ error: 'plan must be pro or free' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: before } = await db.from('buyers')
    .select('id, name, email, crm_plan, crm_subscription_status, trial_ends_at')
    .ilike('email', email)
    .maybeSingle()

  if (!before) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const update: Record<string, unknown> = {
    crm_plan: plan,
    crm_subscription_status: plan === 'pro' ? 'active' : 'cancelled',
  }
  // Se revogando o pro, zera o trial pra nao re-liberar acesso via trial
  if (plan === 'free') update.trial_ends_at = null

  const { error } = await db.from('buyers').update(update).eq('id', before.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: after } = await db.from('buyers')
    .select('id, name, email, crm_plan, crm_subscription_status, trial_ends_at')
    .eq('id', before.id)
    .single()

  return NextResponse.json({ before, after })
}
