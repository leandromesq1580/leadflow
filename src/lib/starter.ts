import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/** ID do pacote Starter (oferta exclusiva da PRIMEIRA compra). */
export const STARTER_PACKAGE_ID = 'lead_5'

/**
 * O comprador JÁ FEZ alguma compra paga? (qualquer pacote, qualquer produto)
 * Regra do Starter: ele só pode ser comprado por quem NUNCA comprou nada.
 * Uma vez que o buyer paga qualquer coisa, perde o Starter pra sempre — mesmo
 * que a 1ª compra tenha sido outro pacote.
 *
 * Cortesia (crédito manual via admin) NÃO conta como compra — quem só recebeu
 * cortesia ainda é elegível ao Starter na 1ª compra de verdade.
 */
export async function hasPurchased(db: Db, buyerId: string): Promise<boolean> {
  // 1) pagamento Stripe concluído = compra (fonte primária)
  const { count } = await db
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', buyerId)
    .eq('status', 'completed')
  if ((count || 0) > 0) return true

  // 2) fallback: crédito comprado de verdade (stripe_payment_id real, não 'manual:')
  const { data: credits } = await db
    .from('credits')
    .select('stripe_payment_id')
    .eq('buyer_id', buyerId)
  return (credits || []).some(c => {
    const sid = c.stripe_payment_id ? String(c.stripe_payment_id) : ''
    return sid && !sid.startsWith('manual:')
  })
}

/** Elegível ao Starter = nunca comprou. */
export async function isStarterEligible(db: Db, buyerId: string): Promise<boolean> {
  return !(await hasPurchased(db, buyerId))
}
