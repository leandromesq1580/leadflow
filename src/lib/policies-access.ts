import { createAdminClient } from './supabase/admin'

/**
 * QUEM ENXERGA A GESTÃO DE APÓLICES (pós-venda) — e o book de QUEM ele enxerga.
 *
 * A tela mostra o book inteiro do corretor — não é feature de plano, é feature de
 * quem tem apólice pra gerenciar. Por isso o acesso é explícito, em settings:
 *
 *   policies_access = {
 *     buyers: ["<id>", …],            // liberados, cada um com o próprio book
 *     share:  { "<id>": "<dono>" }    // sócio que gerencia o book de outra pessoa
 *   }
 *
 * Mais: quem CONECTA a própria seguradora (settings.nl_agent) entra sozinho. Assim
 * a casa começa fechada e abre conforme cada agente pluga o próprio portal.
 *
 * O `share` existe porque sócios do mesmo escritório trabalham UM book só — copiar
 * as apólices pra cada conta criaria duas verdades que divergem no primeiro dia.
 *
 * Roda no layout do dashboard a CADA request: por isso lê tudo numa consulta só.
 * Em qualquer erro nega — feature restrita não pode abrir por falha.
 */

type Db = ReturnType<typeof createAdminClient>

export interface AcessoApolices {
  pode: boolean
  /** dono do book que este usuário gerencia (ele mesmo, ou o sócio) */
  bookDe: string
}

const NEGADO: AcessoApolices = { pode: false, bookDe: '' }

export async function acessoApolices(db: Db, buyerId?: string | null): Promise<AcessoApolices> {
  if (!buyerId) return NEGADO
  try {
    const { data } = await db.from('settings').select('key, value').in('key', ['policies_access', 'nl_agent'])
    const mapa = Object.fromEntries((data || []).map(r => [r.key, r.value as any]))
    const acesso = mapa.policies_access || {}

    const dono = acesso.share?.[buyerId]
    if (dono) return { pode: true, bookDe: String(dono) }

    const liberados = Array.isArray(acesso.buyers) ? acesso.buyers.map(String) : []
    if (liberados.includes(buyerId)) return { pode: true, bookDe: buyerId }

    const conector = mapa.nl_agent?.[buyerId]
    return conector?.url && conector?.key ? { pode: true, bookDe: buyerId } : NEGADO
  } catch { return NEGADO }
}

/** Atalho pro menu e pro gate da página. */
export async function podeVerApolices(db: Db, buyerId?: string | null): Promise<boolean> {
  return (await acessoApolices(db, buyerId)).pode
}
