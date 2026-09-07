import type { createAdminClient } from './supabase/admin'

/**
 * POLÍTICA DE LEADS E USO — aceite versionado (clickwrap).
 * Mudou regra relevante → suba a versão AQUI e todo mundo precisa aceitar de novo
 * antes de continuar usando a plataforma.
 * Registro append-only em policy_acceptances (quem/quando/versão/contexto/IP).
 * Falha fechada: sem confirmação explícita no banco, o aceite continua pendente.
 */
export const CURRENT_POLICY_VERSION = '2026-09-07.1'

type Db = ReturnType<typeof createAdminClient>

/** Buyer já aceitou a versão vigente? Erro de leitura nunca presume aceite. */
export async function hasAcceptedCurrentPolicy(db: Db, buyerId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from('buyers')
      .select('accepted_policy_version').eq('id', buyerId).maybeSingle()
    if (error) return false
    return data?.accepted_policy_version === CURRENT_POLICY_VERSION
  } catch { return false }
}

/** Grava o aceite (append-only + cache no buyer). Idempotente por (buyer, versão). */
export async function recordPolicyAcceptance(
  db: Db, buyerId: string, context: string, ip?: string | null, userAgent?: string | null
): Promise<{ ok: boolean; needsMigration?: boolean; error?: string }> {
  try {
    const { error: insErr } = await db.from('policy_acceptances').insert({
      buyer_id: buyerId, version: CURRENT_POLICY_VERSION, context,
      ip: ip || null, user_agent: (userAgent || '').slice(0, 300) || null,
    })
    // duplicata (já aceitou esta versão) não é erro
    if (insErr && !/duplicate|unique/i.test(insErr.message)) {
      if (/does not exist/i.test(insErr.message)) return { ok: false, needsMigration: true }
      return { ok: false, error: insErr.message }
    }
    const { error: updateErr } = await db.from('buyers')
      .update({ accepted_policy_version: CURRENT_POLICY_VERSION })
      .eq('id', buyerId)
    if (updateErr) return { ok: false, error: updateErr.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
}
