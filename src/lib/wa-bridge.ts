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
  if (!url) url = process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457'
  if (!key) key = process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026'
  return { url: clean(url), key: String(key).trim(), phone }
}


// ============================================================================
// BRIDGE RESERVA (2026-09-27)
// Por que: o canal de avisos (piroli, 786-744-2126) foi deslogado pelo WhatsApp em
// 25/09 e ficou 2 dias em QR. Todo aviso (comprador, grupo admin, e o PRÓPRIO alarme
// de "bridge caiu") saía por ele → tudo sumiu em silêncio. Agora, quando o envio por
// um bridge falha, tenta por outro bridge de conta ADMIN que esteja ready (ex.: a
// linha de vendas 863-280-8696). Resultado em cache por 60 s pra não martelar /status.
// ============================================================================
export interface ReadyBridge { url: string; key: string; phone: string; ownerName: string }
let fallbackCache: { at: number; list: ReadyBridge[] } | null = null

async function bridgeIsReady(url: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/status`, { headers: { apikey: key }, signal: AbortSignal.timeout(4000) })
    const s: any = await res.json().catch(() => null)
    return !!(s && s.ready === true)
  } catch { return false }
}

/** Bridges de contas admin que respondem ready:true agora (cache 60 s). */
export async function readyAdminBridges(db: Db): Promise<ReadyBridge[]> {
  if (fallbackCache && Date.now() - fallbackCache.at < 60_000) return fallbackCache.list
  const { data } = await db.from('buyers')
    .select('name, wa_bridge_url, wa_bridge_key, wa_bridge_phone')
    .eq('is_admin', true).not('wa_bridge_url', 'is', null).not('wa_bridge_key', 'is', null)
  const list: ReadyBridge[] = []
  for (const b of data || []) {
    const url = String(b.wa_bridge_url).trim().replace(/\/$/, '')
    const key = String(b.wa_bridge_key).trim()
    if (!url || !key) continue
    if (await bridgeIsReady(url, key)) list.push({ url, key, phone: String(b.wa_bridge_phone || ''), ownerName: String(b.name || '') })
  }
  fallbackCache = { at: Date.now(), list }
  return list
}

/** Primeiro bridge admin pronto que NÃO seja o que acabou de falhar. */
export async function pickFallbackBridge(db: Db, failedUrl: string): Promise<ReadyBridge | null> {
  const norm = (u: string) => String(u || '').trim().replace(/\/$/, '')
  const failed = norm(failedUrl)
  // :3457 é o nginx na frente do :3456 (piroli) — trata como o mesmo bridge
  const same = (a: string, b: string) => a === b || a.replace(':3457', ':3456') === b.replace(':3457', ':3456')
  const list = await readyAdminBridges(db)
  return list.find(b => !same(norm(b.url), failed)) || null
}

/** Só pra testes: zera o cache. */
export function _resetFallbackCache() { fallbackCache = null }
