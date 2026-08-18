/** Dados do portal da seguradora preservados para o painel de Gestão de Apólices. */

export interface PortalRequirement {
  name: string
  received_at: string | null
}

export interface PortalCommunication {
  author: string | null
  sent_at: string | null
  text: string
}

export interface PortalNewBusinessCase {
  policy_number: string | null
  policy_id: string | null
  client_name: string
  owner: string | null
  submitted_at: string | null
  sent_at: string | null
  annual_premium_cents: number | null
  modal_premium_cents: number | null
  product: string | null
  portal_status: string | null
  delivery_status: string | null
  case_manager: string | null
  underwriter: string | null
  underwriting_tracker: string | null
  requirements: PortalRequirement[]
  communications: PortalCommunication[]
  at_risk_chargeback: boolean
}

export interface PortalNewBusinessMetrics {
  all: number
  pending: number
  at_risk_chargeback: number
  pending_requirements: number
  outstanding_edelivery: number
  pending_eft: number
  unread_messages: number
  anticipated_annual_premium_cents: number
  modal_premium_cents: number
  exact_portal_totals: boolean
}

export interface PortalClientIntelligenceEvent {
  id: string
  category: string
  policy_number: string | null
  policy_id: string | null
  client_name: string | null
  occurred_at: string | null
  portal_url: string | null
  columns: Record<string, string>
}

export interface PortalClientIntelligence {
  available: boolean
  error: string | null
  portal_url: string | null
  metrics: Record<string, number>
  columns: string[]
  events: PortalClientIntelligenceEvent[]
}

export interface PolicyPortalSnapshot {
  carrier: string
  generated_at: string | null
  portal_last_updated: string | null
  new_business: {
    metrics: PortalNewBusinessMetrics
    cases: PortalNewBusinessCase[]
  }
  client_intelligence: PortalClientIntelligence
  changes: Array<{ policy: string; kind: string; change: string }>
}

export const EMPTY_CLIENT_INTELLIGENCE: PortalClientIntelligence = {
  available: false,
  error: null,
  portal_url: null,
  metrics: {},
  columns: [],
  events: [],
}
