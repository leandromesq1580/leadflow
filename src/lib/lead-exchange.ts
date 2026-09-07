import { createAdminClient } from './supabase/admin'

/**
 * TROCA DE LEADS (política 2026-09-07).
 * Só cabe solicitação quando o telefone e/ou e-mail fornecido não existe, é inválido
 * ou está fora de serviço. O comprador declara qual contato está inválido e a equipe
 * confere antes de aprovar. Falta de resposta/interesse não dá direito à troca.
 */

export type InvalidContact = 'phone' | 'email' | 'both'

export interface ExchangeEligibility {
  eligible: boolean
  reasons: string[]           // por que NÃO é elegível (vazio se elegível)
  dossier: {
    assignedAt: string | null
    invalidContact: InvalidContact | null
    phone: string | null
    email: string | null
    details: string | null
  }
}

type Db = ReturnType<typeof createAdminClient>

export async function checkExchangeEligibility(
  db: Db,
  leadId: string,
  buyerId: string,
  claim?: { invalidContact?: string | null; details?: string | null },
): Promise<ExchangeEligibility> {
  const reasons: string[] = []

  const { data: lead } = await db.from('leads')
    .select('id, assigned_to, assigned_at, phone, email')
    .eq('id', leadId).maybeSingle()
  if (!lead || lead.assigned_to !== buyerId) {
    return { eligible: false, reasons: ['Lead não pertence a este comprador.'], dossier: emptyDossier() }
  }

  const invalidContact = ['phone', 'email', 'both'].includes(claim?.invalidContact || '')
    ? claim!.invalidContact as InvalidContact
    : null
  if (claim && !invalidContact) reasons.push('Informe se o telefone, o e-mail ou ambos são inválidos.')

  return {
    eligible: reasons.length === 0,
    reasons,
    dossier: {
      assignedAt: lead.assigned_at || null,
      invalidContact,
      phone: lead.phone || null,
      email: lead.email || null,
      details: claim?.details?.trim().slice(0, 500) || null,
    },
  }
}

function emptyDossier() {
  return { assignedAt: null, invalidContact: null, phone: null, email: null, details: null }
}
