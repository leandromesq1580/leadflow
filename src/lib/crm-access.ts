import type { SupabaseClient } from '@supabase/supabase-js'

export interface CrmAccessBuyer {
  crm_plan?: string | null
  trial_ends_at?: string | null
  is_admin?: boolean | null
}

export function hasCrmAccess(buyer: CrmAccessBuyer | null | undefined): boolean {
  if (!buyer) return false
  if (buyer.is_admin === true) return true
  if (buyer.crm_plan === 'pro') return true
  if (buyer.trial_ends_at && new Date(buyer.trial_ends_at).getTime() > Date.now()) return true
  return false
}

/**
 * Tier "appointment-only": comprou appointment mas nao assinou o CRM.
 * Ve SO a agenda + comprar + configuracoes; o resto fica atras do upsell.
 * Admin e quem tem trial/pro NUNCA sao appointment-only.
 */
export function isAppointmentOnly(buyer: CrmAccessBuyer | null | undefined): boolean {
  if (!buyer) return false
  if (buyer.is_admin === true) return false
  if (hasCrmAccess(buyer)) return false
  return buyer.crm_plan === 'appointment'
}

/** Rotas liberadas pro perfil appointment-only. Todo o resto = UpsellGate. */
export const APPOINTMENT_ALLOWED_ROUTES = [
  '/dashboard/appointments',
  '/dashboard/community',
  '/dashboard/credits',
  '/dashboard/settings',
  '/dashboard/treinamento',
]

/** True se a rota e acessivel pelo perfil appointment-only. */
export function appointmentCanAccess(pathname: string): boolean {
  return APPOINTMENT_ALLOWED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}

/**
 * Tier "lead-only": compra pacotes de leads e gerencia o saldo, mas nao usa
 * pipeline/CRM/whatsapp/automacoes do sistema. Ve SO My Leads + Credits +
 * Settings; o resto fica atras do upsell. Admin e quem tem trial/pro nunca sao
 * lead-only.
 */
export function isLeadOnly(buyer: CrmAccessBuyer | null | undefined): boolean {
  if (!buyer) return false
  if (buyer.is_admin === true) return false
  if (hasCrmAccess(buyer)) return false
  return buyer.crm_plan === 'lead_only'
}

/** Rotas liberadas pro perfil lead-only. Todo o resto = UpsellGate. */
export const LEAD_ALLOWED_ROUTES = [
  '/dashboard/leads',
  '/dashboard/community',
  '/dashboard/credits',
  '/dashboard/settings',
  '/dashboard/treinamento',
]

/** True se a rota e acessivel pelo perfil lead-only. */
export function leadCanAccess(pathname: string): boolean {
  return LEAD_ALLOWED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function trialDaysRemaining(buyer: CrmAccessBuyer | null | undefined): number {
  if (!buyer?.trial_ends_at) return 0
  const ms = new Date(buyer.trial_ends_at).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / 86400_000)
}

export function isTrialActive(buyer: CrmAccessBuyer | null | undefined): boolean {
  if (!buyer?.trial_ends_at) return false
  if (buyer.crm_plan === 'pro') return false
  return new Date(buyer.trial_ends_at).getTime() > Date.now()
}

/**
 * Seleciona colunas do buyer tolerando a ausência de trial_ends_at (caso a migration
 * 010_trial_7d.sql ainda não tenha sido aplicada no ambiente).
 */
export async function fetchBuyerForGate(db: SupabaseClient, authUserId: string): Promise<CrmAccessBuyer | null> {
  const full = await db.from('buyers').select('crm_plan, is_admin, trial_ends_at').eq('auth_user_id', authUserId).single()
  if (!full.error) return full.data as CrmAccessBuyer
  if (/trial_ends_at/i.test(full.error.message || '')) {
    const fb = await db.from('buyers').select('crm_plan, is_admin').eq('auth_user_id', authUserId).single()
    return (fb.data as CrmAccessBuyer) || null
  }
  return null
}
