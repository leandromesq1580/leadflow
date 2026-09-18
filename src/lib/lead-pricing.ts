import { PRODUCTS } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { moneyFromCents } from '@/lib/money'

export { moneyFromCents }

/**
 * PREÇO DE VENDA DE LEADS — fonte única, gerida pelo admin em /admin/precos.
 *
 * O catálogo vigente vive em `settings.key = 'lead_pricing'` (JSONB). Sem linha salva,
 * vale o PADRÃO DE FÁBRICA (`PRODUCTS` em stripe.ts). Tudo que mostra ou cobra preço
 * de lead passa por aqui: /api/checkout (cobrança), tela de compra web, app (/m),
 * preview de cupom, landing (/api/pricing), calculadora, checklist e Meta Ads.
 *
 * Regras:
 *  - Pacote = quantidade + preço por lead (centavos). id derivado: lead_<qtd> / cold_<qtd>
 *    (mantém os ids antigos lead_10/lead_25/lead_50/cold_25/cold_50/cold_100 — links
 *    ?package=lead_10 continuam válidos).
 *  - Preço de equipe de vendas e cupom continuam se sobrepondo ao catálogo
 *    (sales-team-pricing.ts / coupons.ts) — este arquivo só define o CATÁLOGO.
 *  - Leitura com erro de banco LANÇA (nunca cota preço errado); quem só EXIBE usa
 *    readPricingCatalogOrDefault, que cai no padrão e loga.
 */

type Db = ReturnType<typeof createAdminClient>

export const PRICING_SETTINGS_KEY = 'lead_pricing'
export const PRICING_HISTORY_KEY = 'lead_pricing_history'
export const PRICING_HISTORY_MAX = 30
export const MIN_UNIT_CENTS = 100        // $1,00 por lead
export const MAX_UNIT_CENTS = 100_000    // $1.000,00 por lead
export const MAX_QUANTITY = 10_000
export const MAX_PACKAGES = 6

export type PricedProductType = 'lead' | 'cold_lead'
export const PRICED_PRODUCT_TYPES: PricedProductType[] = ['lead', 'cold_lead']
const TYPE_LABEL: Record<PricedProductType, string> = { lead: 'Lead exclusivo', cold_lead: 'Lead frio' }
const ID_PREFIX: Record<PricedProductType, string> = { lead: 'lead', cold_lead: 'cold' }

export interface PackageInput { quantity: number; unitPriceCents: number }
export interface CatalogInput {
  lead: { packages: PackageInput[] }
  cold_lead: { packages: PackageInput[] }
}

export interface PricingPackage extends PackageInput {
  id: string
  totalCents: number
  /** dólares (pode ter centavos): 28, 27.5 */
  pricePerUnit: number
  /** total em dólares: 280, 1150 */
  totalDisplay: number
  label: string
}

export interface PricingCatalog {
  lead: { name: string; packages: PricingPackage[] }
  cold_lead: { name: string; packages: PricingPackage[] }
  /** preço do lead "de entrada" (menor pacote de lead exclusivo), em centavos */
  anchorLeadCents: number
  source: 'db' | 'default'
  updatedAt: string | null
  updatedBy: string | null
}

export function packageId(type: PricedProductType, quantity: number): string {
  return `${ID_PREFIX[type]}_${quantity}`
}

/** Padrão de fábrica = o que está em stripe.ts (usado enquanto o admin nunca salvou). */
export function defaultCatalogInput(): CatalogInput {
  return {
    lead: { packages: PRODUCTS.lead.packages.map(p => ({ quantity: p.quantity, unitPriceCents: p.unitPriceCents })) },
    cold_lead: { packages: PRODUCTS.cold_lead.packages.map(p => ({ quantity: p.quantity, unitPriceCents: p.unitPriceCents })) },
  }
}

export type CatalogValidation = { ok: true; value: CatalogInput } | { ok: false; error: string }

/** Valida um catálogo vindo do admin (ou do banco). Ordena por quantidade; ignora campos extras. */
export function validateCatalogInput(raw: unknown): CatalogValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Formato inválido.' }
  const out = { lead: { packages: [] }, cold_lead: { packages: [] } } as CatalogInput
  for (const type of PRICED_PRODUCT_TYPES) {
    const label = TYPE_LABEL[type]
    const list = (raw as Record<string, { packages?: unknown }>)[type]?.packages
    if (!Array.isArray(list)) return { ok: false, error: `${label}: lista de pacotes ausente.` }
    if (list.length > MAX_PACKAGES) return { ok: false, error: `${label}: no máximo ${MAX_PACKAGES} pacotes.` }
    if (type === 'lead' && list.length === 0) return { ok: false, error: 'Lead exclusivo precisa de pelo menos 1 pacote.' }
    const seen = new Set<number>()
    const packages: PackageInput[] = []
    for (const [i, p] of (list as Array<Record<string, unknown>>).entries()) {
      const quantity = Number(p?.quantity)
      const unitPriceCents = Number(p?.unitPriceCents)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return { ok: false, error: `${label}, pacote ${i + 1}: quantidade deve ser um número inteiro entre 1 e ${MAX_QUANTITY}.` }
      }
      if (!Number.isInteger(unitPriceCents) || unitPriceCents < MIN_UNIT_CENTS || unitPriceCents > MAX_UNIT_CENTS) {
        return { ok: false, error: `${label}, pacote ${i + 1}: preço por lead deve ficar entre $1,00 e $1.000,00.` }
      }
      if (seen.has(quantity)) return { ok: false, error: `${label}: quantidade ${quantity} repetida.` }
      seen.add(quantity)
      packages.push({ quantity, unitPriceCents })
    }
    packages.sort((a, b) => a.quantity - b.quantity)
    out[type] = { packages }
  }
  return { ok: true, value: out }
}

function buildPackages(type: PricedProductType, packages: PackageInput[]): PricingPackage[] {
  return packages.map(p => {
    const totalCents = p.quantity * p.unitPriceCents
    return {
      quantity: p.quantity,
      unitPriceCents: p.unitPriceCents,
      id: packageId(type, p.quantity),
      totalCents,
      pricePerUnit: p.unitPriceCents / 100,
      totalDisplay: totalCents / 100,
      label: `${p.quantity} ${type === 'lead' ? 'Leads' : 'Leads Frios'} — ${moneyFromCents(totalCents)}`,
    }
  })
}

export function buildCatalog(
  input: CatalogInput,
  meta: { source: 'db' | 'default'; updatedAt: string | null; updatedBy: string | null },
): PricingCatalog {
  const lead = buildPackages('lead', input.lead.packages)
  const cold = buildPackages('cold_lead', input.cold_lead.packages)
  return {
    lead: { name: PRODUCTS.lead.name, packages: lead },
    cold_lead: { name: PRODUCTS.cold_lead.name, packages: cold },
    anchorLeadCents: lead[0]?.unitPriceCents ?? PRODUCTS.lead.packages[0].unitPriceCents,
    ...meta,
  }
}

export function defaultCatalog(): PricingCatalog {
  return buildCatalog(defaultCatalogInput(), { source: 'default', updatedAt: null, updatedBy: null })
}

/**
 * Leitura pra tela do ADMIN: erro de banco lança, mas linha salva inválida NÃO trava a tela —
 * devolve o padrão de fábrica + `storedError`, pra ele ver o problema e salvar por cima.
 */
export async function readPricingCatalogForAdmin(db: Db): Promise<{ catalog: PricingCatalog; storedError: string | null }> {
  const { data, error } = await db.from('settings').select('value, updated_at').eq('key', PRICING_SETTINGS_KEY).maybeSingle()
  if (error) throw new Error('Não foi possível ler a tabela de preços. Tente novamente.')
  if (!data) return { catalog: defaultCatalog(), storedError: null }
  const v = validateCatalogInput(data.value)
  if (!v.ok) return { catalog: defaultCatalog(), storedError: v.error }
  const stored = (data.value || {}) as { updated_by?: string | null }
  return { catalog: buildCatalog(v.value, { source: 'db', updatedAt: data.updated_at ?? null, updatedBy: stored.updated_by ?? null }), storedError: null }
}

/**
 * Catálogo vigente. Sem linha salva = padrão de fábrica. Erro de banco ou linha
 * corrompida LANÇA — quem cobra (checkout) nunca pode cair num preço que não é o vigente.
 */
export async function readPricingCatalog(db: Db): Promise<PricingCatalog> {
  const { catalog, storedError } = await readPricingCatalogForAdmin(db)
  if (storedError) throw new Error(`Tabela de preços salva é inválida (${storedError}). Corrija em /admin/precos.`)
  return catalog
}

/** Para telas que só EXIBEM preço: falha de leitura vira padrão de fábrica + log (não derruba a página). */
export async function readPricingCatalogOrDefault(db: Db): Promise<PricingCatalog> {
  try { return await readPricingCatalog(db) }
  catch (e) { console.error('[pricing] usando padrão de fábrica:', e instanceof Error ? e.message : e); return defaultCatalog() }
}

export function findPackage(catalog: PricingCatalog, id: unknown): { productType: PricedProductType; pkg: PricingPackage } | null {
  if (typeof id !== 'string') return null
  for (const productType of PRICED_PRODUCT_TYPES) {
    const pkg = catalog[productType].packages.find(p => p.id === id)
    if (pkg) return { productType, pkg }
  }
  return null
}

/** Resumo de uma linha pro histórico: "Lead: 10=$28 · 25=$26 · 50=$23 | Frio: 25=$4 · 50=$4 · 100=$3" */
export function summarizeCatalogInput(input: CatalogInput): string {
  const part = (label: string, packages: PackageInput[]) =>
    `${label}: ${packages.length ? packages.map(p => `${p.quantity}=${moneyFromCents(p.unitPriceCents)}`).join(' · ') : '—'}`
  return `${part('Lead', input.lead.packages)} | ${part('Frio', input.cold_lead.packages)}`
}

export interface PricingHistoryEntry {
  lead: { packages: PackageInput[] }
  cold_lead: { packages: PackageInput[] }
  summary: string
  /** quando esta versão DEIXOU de valer */
  replaced_at: string
  replaced_by: string | null
  replaced_by_email: string | null
  /** quando esta versão passou a valer (null = padrão de fábrica) */
  updated_at: string | null
  updated_by: string | null
  source: 'db' | 'default'
}

/** Salva o catálogo (já validado) e empurra a versão anterior pro histórico (últimas 30). */
export async function savePricingCatalog(
  db: Db,
  input: CatalogInput,
  actor: { id: string; email?: string | null },
): Promise<PricingCatalog> {
  const now = new Date().toISOString()
  const { data: prev, error: prevError } = await db.from('settings').select('value, updated_at').eq('key', PRICING_SETTINGS_KEY).maybeSingle()
  if (prevError) throw new Error('Não foi possível ler a tabela de preços atual.')

  // histórico: a versão que está saindo (ou o padrão de fábrica, na primeira gravação)
  const prevValidated = prev ? validateCatalogInput(prev.value) : null
  const prevWasValid = !!(prevValidated && prevValidated.ok)
  const prevInput = prevWasValid ? prevValidated!.value : defaultCatalogInput()
  const prevMeta = (prev?.value || {}) as { updated_by?: string | null }
  const entry: PricingHistoryEntry = {
    lead: prevInput.lead, cold_lead: prevInput.cold_lead,
    summary: summarizeCatalogInput(prevInput) + (prev && !prevWasValid ? ' (linha anterior inválida — valia o padrão de fábrica)' : ''),
    replaced_at: now, replaced_by: actor.id, replaced_by_email: actor.email ?? null,
    updated_at: prev?.updated_at ?? null, updated_by: prevMeta.updated_by ?? null,
    source: prevWasValid ? 'db' : 'default',
  }
  const { data: hist } = await db.from('settings').select('value').eq('key', PRICING_HISTORY_KEY).maybeSingle()
  const histValue = (hist?.value || {}) as { entries?: unknown }
  const entries = Array.isArray(histValue.entries) ? (histValue.entries as PricingHistoryEntry[]) : []
  const { error: histError } = await db.from('settings').upsert({
    key: PRICING_HISTORY_KEY, value: { entries: [entry, ...entries].slice(0, PRICING_HISTORY_MAX) }, updated_at: now,
  })
  if (histError) throw new Error('Não foi possível gravar o histórico de preços.')

  const value = { version: 1, lead: input.lead, cold_lead: input.cold_lead, updated_at: now, updated_by: actor.id, updated_by_email: actor.email ?? null }
  const { error } = await db.from('settings').upsert({ key: PRICING_SETTINGS_KEY, value, updated_at: now })
  if (error) throw new Error('Não foi possível salvar a tabela de preços.')
  return buildCatalog(input, { source: 'db', updatedAt: now, updatedBy: actor.id })
}

export async function readPricingHistory(db: Db): Promise<PricingHistoryEntry[]> {
  const { data } = await db.from('settings').select('value').eq('key', PRICING_HISTORY_KEY).maybeSingle()
  const v = (data?.value || {}) as { entries?: unknown }
  return Array.isArray(v.entries) ? (v.entries as PricingHistoryEntry[]) : []
}
