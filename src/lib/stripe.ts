import Stripe from 'stripe'

// Lazy init — avoids build-time crash when STRIPE_SECRET_KEY is not set
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!key || key.includes('placeholder')) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    _stripe = new Stripe(key)
  }
  return _stripe
}

// Alias for backward compat — use getStripe() in API routes
export const stripe = null as unknown as Stripe

// Product configs — unitPriceCents is per-unit in cents for Stripe
export const PRODUCTS = {
  lead: {
    name: 'Lead Exclusivo',
    packages: [
      // Âncora $28/lead (jul/2026). Starter = isca de 1ª compra ($25/lead, -10,7%).
      // Objetivo do Starter: agente novo testar o sistema com o equivalente a 1 apolice fechada.
      { id: 'lead_5', quantity: 5, unitPriceCents: 2500, totalDisplay: 125, label: 'Starter — 5 Leads $125', pricePerUnit: 25 },
      { id: 'lead_10', quantity: 10, unitPriceCents: 2800, totalDisplay: 280, label: '10 Leads — $280', pricePerUnit: 28 },
      { id: 'lead_25', quantity: 25, unitPriceCents: 2600, totalDisplay: 650, label: '25 Leads — $650', pricePerUnit: 26 },
      { id: 'lead_50', quantity: 50, unitPriceCents: 2300, totalDisplay: 1150, label: '50 Leads — $1,150', pricePerUnit: 23 },
    ],
  },
  cold_lead: {
    name: 'Lead Frio',
    packages: [
      { id: 'cold_25', quantity: 25, unitPriceCents: 600, totalDisplay: 150, label: '25 Leads Frios — $150', pricePerUnit: 6 },
      { id: 'cold_50', quantity: 50, unitPriceCents: 500, totalDisplay: 250, label: '50 Leads Frios — $250', pricePerUnit: 5 },
      { id: 'cold_100', quantity: 100, unitPriceCents: 400, totalDisplay: 400, label: '100 Leads Frios — $400', pricePerUnit: 4 },
    ],
  },
  // Appointments NÃO são mais vendidos (decisão de produto, jul/2026). Nenhum pacote de
  // appointment é ofertado. O rastreio/entrega dos créditos já pagos segue no webhook
  // (string 'appointment') e na agenda — só a VENDA foi removida.
} as const

export type ProductType = keyof typeof PRODUCTS
export type PackageId = (typeof PRODUCTS)[ProductType]['packages'][number]['id']
