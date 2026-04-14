import Stripe from 'stripe'

// Lazy init — avoids build-time crash when STRIPE_SECRET_KEY is not set
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key || key.includes('placeholder')) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    _stripe = new Stripe(key, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    })
  }
  return _stripe
}

// Alias for backward compat — use getStripe() in API routes
export const stripe = null as unknown as Stripe

// Product configs — prices in cents
export const PRODUCTS = {
  lead: {
    name: 'Lead Exclusivo',
    packages: [
      { id: 'lead_10', quantity: 10, price: 2200, label: '10 Leads — $220', pricePerUnit: 22 },
      { id: 'lead_25', quantity: 25, price: 5000, label: '25 Leads — $500 (economize $50)', pricePerUnit: 20 },
      { id: 'lead_50', quantity: 50, price: 9000, label: '50 Leads — $900 (economize $200)', pricePerUnit: 18 },
    ],
  },
  appointment: {
    name: 'Appointment Agendado',
    packages: [
      { id: 'appt_10', quantity: 10, price: 3800, label: '10 Appointments — $380', pricePerUnit: 38 },
      { id: 'appt_25', quantity: 25, price: 8750, label: '25 Appointments — $875 (economize $75)', pricePerUnit: 35 },
    ],
  },
} as const

export type ProductType = keyof typeof PRODUCTS
export type PackageId = (typeof PRODUCTS)[ProductType]['packages'][number]['id']
