import type { createAdminClient } from './supabase/admin'
import { currentPolicyEvidence } from './policies'
import type { Locale } from './i18n'

type Db = ReturnType<typeof createAdminClient>

/** Campos gravados na Stripe e copiados para a prova definitiva no webhook. */
export async function checkoutPolicyMetadata(db: Db, buyerId: string, locale: Locale) {
  const evidence = await currentPolicyEvidence(db, buyerId)
  return {
    policy_version: evidence.version,
    policy_sha256: evidence.sha256,
    policy_acceptance_id: evidence.acceptanceId,
    policy_accepted_at: evidence.acceptedAt,
    policy_locale: locale,
  }
}

/** O Checkout nativo mostra o checkbox obrigatório antes de o cliente pagar. */
export const stripeTermsConsent = {
  terms_of_service: 'required' as const,
}
