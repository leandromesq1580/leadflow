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
      { id: 'lead_10', quantity: 10, unitPriceCents: 2200, totalDisplay: 220, label: '10 Leads — $220', pricePerUnit: 22 },
      { id: 'lead_25', quantity: 25, unitPriceCents: 2000, totalDisplay: 500, label: '25 Leads — $500', pricePerUnit: 20 },
      { id: 'lead_50', quantity: 50, unitPriceCents: 1800, totalDisplay: 900, label: '50 Leads — $900', pricePerUnit: 18 },
    ],
  },
  cold_lead: {
    name: 'Lead Frio',
    packages: [
      { id: 'cold_25', quantity: 25, unitPriceCents: 500, totalDisplay: 125, label: '25 Leads Frios — $125', pricePerUnit: 5 },
      { id: 'cold_50', quantity: 50, unitPriceCents: 400, totalDisplay: 200, label: '50 Leads Frios — $200', pricePerUnit: 4 },
      { id: 'cold_100', quantity: 100, unitPriceCents: 300, totalDisplay: 300, label: '100 Leads Frios — $300', pricePerUnit: 3 },
    ],
  },
  appointment: {
    name: 'Appointment Agendado',
    packages: [
      { id: 'appt_10', quantity: 10, unitPriceCents: 3800, totalDisplay: 380, label: '10 Appointments — $380', pricePerUnit: 38 },
      { id: 'appt_25', quantity: 25, unitPriceCents: 3500, totalDisplay: 875, label: '25 Appointments — $875', pricePerUnit: 35 },
    ],
  },
} as const

export type ProductType = keyof typeof PRODUCTS
export type PackageId = (typeof PRODUCTS)[ProductType]['packages'][number]['id']
