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
