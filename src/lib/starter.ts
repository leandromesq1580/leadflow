import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * O comprador JÁ FEZ alguma compra paga? (qualquer pacote, qualquer produto)
 *
 * OBS: o pacote Starter foi REMOVIDO em 2026-07-10. Esta função sobrevive porque
 * o gate da Comunidade (só-pagante) usa `hasPurchased` pra liberar acesso.
 *
 * Cortesia (crédito manual via admin) NÃO conta como compra — só pagamento real.
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
