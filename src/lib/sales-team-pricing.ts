import type { createAdminClient } from '@/lib/supabase/admin'

export const DEFAULT_TEAM_LEAD_PRICE_CENTS = 2100
export interface SalesTeamPricing { is_member: boolean; lead_unit_price_cents: number }
export const NO_TEAM_PRICING: SalesTeamPricing = { is_member: false, lead_unit_price_cents: DEFAULT_TEAM_LEAD_PRICE_CENTS }

export function validTeamPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 50 && value <= 100000
}

/** Missing row means normal customer. A database failure is never a price quote. */
export async function readSalesTeamPricing(db: ReturnType<typeof createAdminClient>, buyerId: string): Promise<SalesTeamPricing> {
  const { data, error } = await db.from('sales_team_pricing')
    .select('is_member, lead_unit_price_cents').eq('buyer_id', buyerId).maybeSingle()
  if (error) throw new Error('Não foi possível verificar o preço desta conta. Tente novamente.')
  if (!data) return { ...NO_TEAM_PRICING }
  if (typeof data.is_member !== 'boolean' || !validTeamPrice(data.lead_unit_price_cents)) {
    throw new Error('Preço da equipe inválido. Contate o suporte.')
  }
  return data
}

/** Same calculation for checkout, web, mobile and coupon preview. No stacking. */
export function purchaseUnitPrice(
  productType: string,
  catalogCents: number,
  team: SalesTeamPricing,
  coupon?: { unitPriceCents: number; code: string } | null,
): { unitPriceCents: number; source: 'catalog' | 'sales_team' | 'coupon'; couponCode: string } {
  if (productType !== 'lead') return { unitPriceCents: catalogCents, source: 'catalog', couponCode: '' }
  if (team.is_member) {
    if (!validTeamPrice(team.lead_unit_price_cents)) throw new Error('Invalid team price')
    if (!coupon || team.lead_unit_price_cents <= coupon.unitPriceCents) {
      return { unitPriceCents: team.lead_unit_price_cents, source: 'sales_team', couponCode: '' }
    }
  }
  return coupon
    ? { unitPriceCents: coupon.unitPriceCents, source: 'coupon', couponCode: coupon.code }
    : { unitPriceCents: catalogCents, source: 'catalog', couponCode: '' }
}
