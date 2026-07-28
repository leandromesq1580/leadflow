import { createAdminClient } from './supabase/admin'

/**
 * POLÍTICA DE LEADS E USO — aceite versionado (clickwrap), decisão 2026-07-28.
 * Mudou regra relevante → suba a versão AQUI e todo mundo precisa aceitar de novo
 * antes da PRÓXIMA compra (o uso do CRM não trava; compra trava — escolha do dono).
 * Registro append-only em policy_acceptances (quem/quando/versão/contexto/IP).
 * TOLERANTE: antes da migration 033 rodar, o gate fica INERTE (não bloqueia venda).
 */
export const CURRENT_POLICY_VERSION = '2026-07-28.1'

type Db = ReturnType<typeof createAdminClient>

/** Buyer já aceitou a versão vigente? (pré-migration → true, gate inerte) */
export async function hasAcceptedCurrentPolicy(db: Db, buyerId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from('buyers')
      .select('accepted_policy_version').eq('id', buyerId).maybeSingle()
    if (error) return true // coluna ainda não existe → não bloqueia venda
    return data?.accepted_policy_version === CURRENT_POLICY_VERSION
  } catch { return true }
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
    await db.from('buyers').update({ accepted_policy_version: CURRENT_POLICY_VERSION }).eq('id', buyerId)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
}
