import { createAdminClient } from './supabase/admin'

/**
 * QUEM ENXERGA A GESTÃO DE APÓLICES (pós-venda).
 *
 * A tela mostra o book inteiro do corretor — não é feature de plano, é feature de
 * quem tem apólice pra gerenciar. Por isso o acesso é explícito:
 *
 *   1) lista de liberação em settings.policies_access.buyers (sem deploy), e
 *   2) qualquer corretor que CONECTE a própria conta da seguradora entra sozinho
 *      (settings.nl_agent tem a config dele).
 *
 * Assim a casa começa fechada (hoje: só o dono e a sócia) e abre naturalmente
 * conforme cada agente pluga o próprio portal — sem precisar mexer em código.
 *
 * Roda no layout do dashboard a CADA request: por isso lê as duas chaves numa
 * consulta só. Em qualquer erro nega — feature restrita não pode abrir por falha.
 */

type Db = ReturnType<typeof createAdminClient>

export async function podeVerApolices(db: Db, buyerId?: string | null): Promise<boolean> {
  if (!buyerId) return false
  try {
    const { data } = await db.from('settings').select('key, value').in('key', ['policies_access', 'nl_agent'])
    const mapa = Object.fromEntries((data || []).map(r => [r.key, r.value as any]))

    const liberados = mapa.policies_access?.buyers
    if (Array.isArray(liberados) && liberados.map(String).includes(buyerId)) return true

    const conector = mapa.nl_agent?.[buyerId]
    return !!(conector?.url && conector?.key)
  } catch { return false }
}
