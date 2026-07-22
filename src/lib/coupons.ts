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
  // Bianca Zimmer (conta PRINCIPAL) — preço legado $22/lead em qualquer pacote, permanente.
  LEADZIMMER22: {
    code: 'LEADZIMMER22',
    productType: 'lead',
    unitPriceCents: 2200,
    allowedEmails: ['biancazimmer@gmail.com'],
    label: 'Parceiro — $22/lead',
  },
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
