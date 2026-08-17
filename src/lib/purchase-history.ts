export type PurchaseHistorySource = 'payment' | 'manual_credit' | 'bonus_credit' | 'legacy_credit'

export interface PurchaseHistoryPayment {
  id: string
  amount: number | string
  product_type: string
  quantity: number
  price_per_unit: number | string
  status: string
  created_at: string
  stripe_session_id?: string | null
  stripe_payment_intent_id?: string | null
}

export interface PurchaseHistoryCredit {
  id: string
  type: string
  total_purchased: number
  total_used: number
  price_per_unit: number | string
  purchased_at: string
  stripe_payment_id?: string | null
}

export interface PurchaseHistoryItem {
  id: string
  source: PurchaseHistorySource
  productType: string
  quantity: number
  amount: number
  pricePerUnit: number
  status: string
  purchasedAt: string
  totalUsed: number | null
  remaining: number | null
  note: string | null
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Une o registro financeiro (payments) ao saldo entregue (credits).
 *
 * Uma compra de pacote normalmente gera uma linha em cada tabela. O payment e a
 * compra canonica; o credit correspondente serve apenas para informar usados e
 * restantes. Creditos sem payment continuam visiveis como cortesia, bonus ou
 * legado, evitando sumir com ajustes administrativos e compras antigas.
 */
export function buildPurchaseHistory(
  payments: readonly PurchaseHistoryPayment[] | null | undefined,
  credits: readonly PurchaseHistoryCredit[] | null | undefined,
): PurchaseHistoryItem[] {
  const paymentRows = payments || []
  const creditRows = credits || []
  const creditsByReference = new Map<string, PurchaseHistoryCredit>()

  for (const credit of creditRows) {
    if (credit.stripe_payment_id) creditsByReference.set(credit.stripe_payment_id, credit)
  }

  const matchedCreditIds = new Set<string>()
  const history: PurchaseHistoryItem[] = paymentRows.map(payment => {
    const credit = [payment.stripe_payment_intent_id, payment.stripe_session_id]
      .filter((value): value is string => !!value)
      .map(reference => creditsByReference.get(reference))
      .find(Boolean)

    if (credit) matchedCreditIds.add(credit.id)

    return {
      id: `payment:${payment.id}`,
      source: 'payment',
      productType: payment.product_type,
      quantity: Number(payment.quantity || 0),
      amount: numeric(payment.amount),
      pricePerUnit: numeric(payment.price_per_unit),
      status: payment.status || 'completed',
      purchasedAt: payment.created_at,
      totalUsed: credit ? Number(credit.total_used || 0) : null,
      remaining: credit ? Number(credit.total_purchased || 0) - Number(credit.total_used || 0) : null,
      note: null,
    }
  })

  for (const credit of creditRows) {
    if (matchedCreditIds.has(credit.id)) continue

    const reference = credit.stripe_payment_id || ''
    const isManual = reference.startsWith('manual:')
    const isBonus = reference.startsWith('crm-bonus:') || reference.startsWith('crm-bonus-cycle:') || reference.startsWith('crm-drip:')
    const pricePerUnit = numeric(credit.price_per_unit)

    history.push({
      id: `credit:${credit.id}`,
      source: isManual ? 'manual_credit' : isBonus ? 'bonus_credit' : 'legacy_credit',
      productType: credit.type,
      quantity: Number(credit.total_purchased || 0),
      amount: isManual || isBonus ? 0 : Number(credit.total_purchased || 0) * pricePerUnit,
      pricePerUnit,
      status: isManual ? 'courtesy' : isBonus ? 'bonus' : 'completed',
      purchasedAt: credit.purchased_at,
      totalUsed: Number(credit.total_used || 0),
      remaining: Number(credit.total_purchased || 0) - Number(credit.total_used || 0),
      note: isManual ? reference.slice('manual:'.length) || null : null,
    })
  }

  return history.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
}
