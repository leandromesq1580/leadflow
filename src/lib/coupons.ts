// Cupons da PLATAFORMA (não são cupons do Stripe): validados no NOSSO checkout, que
// força o preço por lead no unit_amount. Motivo: os pacotes têm desconto progressivo
// ($28/$26/$23), então nenhum percentual único do Stripe deixaria todos no preço-alvo.
// Cada cupom é TRAVADO por email do comprador — código vazado não funciona pra outra conta.
export interface PlatformCoupon {
  code: string
  productType: 'lead'
  unitPriceCents: number
  allowedEmails: string[] // lowercase
  label: string
}

export const PLATFORM_COUPONS: Record<string, PlatformCoupon> = {
  // Vazio desde 2026-09-07: LEADZIMMER22 (Bianca Zimmer, $22/lead legado) removido a
  // pedido do dono — nunca chegou a ser usado (a única compra de leads da conta foi a
  // $28, preço de catálogo) e hoje o preço fora do catálogo vem de sales_team_pricing.
  // Para criar um cupom novo, basta adicionar a entrada aqui (travada por email).
}

export function resolveCoupon(
  codeRaw: string | null | undefined,
  buyerEmail: string | null | undefined
): PlatformCoupon | null {
  const code = String(codeRaw || '').trim().toUpperCase()
  if (!code) return null
  const coupon = PLATFORM_COUPONS[code]
  if (!coupon) return null
  const email = String(buyerEmail || '').trim().toLowerCase()
  if (!coupon.allowedEmails.includes(email)) return null
  return coupon
}
