import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export interface BridgeConfig {
  url: string
  key: string
  phone?: string | null
  status?: string | null
  ownerBuyerId: string
}

/**
 * Retorna a bridge WhatsApp do buyer (ou null se nao conectou).
 * Tolera buyers sem as colunas novas (fallback pra envvars globais quando a
 * migration 011 ainda nao rodou).
 */
export async function getBridgeForBuyer(db: Db, buyerId: string): Promise<BridgeConfig | null> {
  const { data, error } = await db
    .from('buyers')
    .select('id, wa_bridge_url, wa_bridge_key, wa_bridge_phone, wa_bridge_status')
    .eq('id', buyerId)
    .maybeSingle()

  if (error || !data) return null
  if (!data.wa_bridge_url || !data.wa_bridge_key) return null
  return {
    url: String(data.wa_bridge_url).replace(/\/$/, ''),
    key: String(data.wa_bridge_key),
    phone: data.wa_bridge_phone,
    status: data.wa_bridge_status,
    ownerBuyerId: data.id,
  }
}

/**
 * Resolve a bridge que deve ser usada pra um lead — respeita ownership
 * (assigned_to_member -> buyer do membro; senao assigned_to).
 */
export async function getBridgeForLeadOwner(db: Db, leadId: string): Promise<BridgeConfig | null> {
  const { data: lead } = await db
    .from('leads')
    .select('assigned_to, assigned_to_member')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return null

  let ownerBuyerId: string | null = lead.assigned_to || null
  if (lead.assigned_to_member) {
    const { data: member } = await db
      .from('team_members')
      .select('auth_user_id')
      .eq('id', lead.assigned_to_member)
      .maybeSingle()
    if (member?.auth_user_id) {
      const { data: memberBuyer } = await db
        .from('buyers')
        .select('id')
        .eq('auth_user_id', member.auth_user_id)
        .maybeSingle()
      if (memberBuyer?.id) ownerBuyerId = memberBuyer.id
    }
  }
  if (!ownerBuyerId) return null
  return getBridgeForBuyer(db, ownerBuyerId)
}

/**
 * Resolve URL + chave da bridge pra ENVIAR uma mensagem em nome de um buyer.
 * Usa a bridge própria do buyer quando ele tem uma; senão cai na bridge global
 * (env WA_BRIDGE_URL / default :3457). Garante que mensagens AUTOMÁTICAS
 * (sequências, automações, alertas de lead novo) saiam do WhatsApp do DONO do
 * lead — não de uma instância global compartilhada.
 *
 * A exceção Fernanda Bridi → Regiane continua valendo: como a wa_bridge_url da
 * Fernanda aponta de propósito pra instância da Regiane (:3457), resolver pelo
 * registro do próprio buyer mantém ela na bridge da Regiane automaticamente.
 */
export async function resolveSendBridge(
  db: Db,
  buyerId: string | null | undefined,
): Promise<{ url: string; key: string; phone: string }> {
  const clean = (s: string) => String(s).trim().replace(/\\n/g, '').replace(/\s+$/, '').replace(/\/$/, '')
  let url = ''
  let key = ''
  let phone = ''
  if (buyerId) {
    const b = await getBridgeForBuyer(db, buyerId)
    if (b) { url = b.url; key = b.key; phone = b.phone || '' }
  }
  if (!url) url = process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457'
  if (!key) key = process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026'
  return { url: clean(url), key: String(key).trim(), phone }
}
