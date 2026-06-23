import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/backfill-crm-revenue — importa do Stripe TODAS as faturas pagas
 * das assinaturas CRM e grava como payment (type 'crm') pra entrar na receita
 * histórica. Idempotente (dedup pela invoice id em stripe_session_id). Só admin.
 */
export async function POST(request: Request) {
  const db = createAdminClient()
  // Autoriza por admin OU por secret (pra rodar via script sem sessão admin).
  const bySecret = new URL(request.url).searchParams.get('secret') === (process.env.POLL_SECRET || 'leadflow-poll-2026')
  if (!bySecret) {
    const supa = await createServerSupabase()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
    if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: payers } = await db.from('buyers').select('id, crm_subscription_id').not('crm_subscription_id', 'is', null)
  const stripe = getStripe()
  let inserted = 0, skipped = 0, errors = 0
  const errMsgs: string[] = []
  for (const b of (payers || [])) {
    try {
      const invoices = await stripe.invoices.list({ subscription: b.crm_subscription_id as string, status: 'paid', limit: 100 })
      for (const inv of invoices.data) {
        const amount = (inv.amount_paid || 0) / 100
        if (amount <= 0) continue
        const { data: dupe } = await db.from('payments').select('id').eq('stripe_session_id', inv.id).maybeSingle()
        if (dupe) { skipped++; continue }
        const { error } = await db.from('payments').insert({
          buyer_id: b.id,
          stripe_session_id: inv.id,
          stripe_payment_intent_id: (inv as any).payment_intent || null,
          amount,
          product_type: 'crm',
          quantity: 1,
          price_per_unit: amount,
          status: 'completed',
          created_at: new Date(((inv.created as number) || 0) * 1000).toISOString(),
        })
        if (error) { errors++; errMsgs.push('insert: ' + error.message); console.error('[backfill-crm] insert:', error.message) } else inserted++
      }
    } catch (e: any) { errors++; errMsgs.push(e?.message || String(e)); console.error('[backfill-crm] sub', b.crm_subscription_id, e?.message) }
  }
  return NextResponse.json({ ok: true, inserted, skipped, errors, sample_error: errMsgs[0] || null })
}
