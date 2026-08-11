import { createAdminClient } from './supabase/admin'

/**
 * IDIOMA DE CADA CORRETOR PARA AVISOS DO SERVIDOR (push, WhatsApp da plataforma).
 *
 * A interface escolhe o idioma por cookie — que cron e webhook nunca enxergam.
 * Então o painel espelha a escolha aqui (settings `locale:<buyerId>`, via
 * /api/me/locale — sem migration). Quem nunca gravou recebe 'pt', que era o
 * comportamento de sempre da casa.
 */

type Db = ReturnType<typeof createAdminClient>
export type BuyerLocale = 'pt' | 'en' | 'es'

const norm = (v: unknown): BuyerLocale => (v === 'en' ? 'en' : v === 'es' ? 'es' : 'pt')

export async function localeDoBuyer(db: Db, buyerId: string | null | undefined): Promise<BuyerLocale> {
  if (!buyerId) return 'pt'
  try {
    const { data } = await db.from('settings').select('value').eq('key', `locale:${buyerId}`).maybeSingle()
    return norm((data?.value as { locale?: string } | null)?.locale)
  } catch {
    return 'pt'
  }
}

/** vários de uma vez (aviso de grupo) — mapa id → locale, 'pt' por padrão */
export async function localesDosBuyers(db: Db, ids: string[]): Promise<Record<string, BuyerLocale>> {
  const out: Record<string, BuyerLocale> = {}
  ids.forEach(id => { out[id] = 'pt' })
  if (!ids.length) return out
  try {
    const { data } = await db.from('settings').select('key, value').in('key', ids.map(id => `locale:${id}`))
    for (const row of data || []) out[String(row.key).slice('locale:'.length)] = norm((row.value as { locale?: string } | null)?.locale)
  } catch { /* qualquer falha → todo mundo 'pt' */ }
  return out
}

/** escolhe o texto no idioma do corretor — mesmo espírito do L() da interface */
export const trad = (loc: BuyerLocale) => (pt: string, en: string, es: string) =>
  loc === 'en' ? en : loc === 'es' ? es : pt
