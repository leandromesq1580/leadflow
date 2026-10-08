import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>
export const BUYER_FEATURES = [{ id: 'ia_ligacao', label: 'Ligação com IA' }] as const
export type BuyerFeatureId = typeof BUYER_FEATURES[number]['id']
export type FeatureMode = 'default' | 'enabled' | 'disabled'
export type BuyerFeatureState = {
  id: BuyerFeatureId
  label: string
  mode: FeatureMode
  enabled: boolean
  source: 'admin' | 'subscription' | 'courtesy' | 'none'
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isBuyerId = (id: string) => UUID.test(id)
export const buyerFeatureKey = (id: BuyerFeatureId, buyerId: string) => `buyer_feature:${id}:${buyerId}`
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

export function parseBuyerFeatureChange(body: unknown): { feature: BuyerFeatureId; mode: FeatureMode } | null {
  const v = record(body)
  if (Object.keys(v).length !== 2 || !BUYER_FEATURES.some(f => f.id === v.feature) || !['default', 'enabled', 'disabled'].includes(String(v.mode))) return null
  return { feature: v.feature as BuyerFeatureId, mode: v.mode as FeatureMode }
}

/** Explicit admin block wins over subscription and legacy courtesy; no override preserves both. */
export function resolveBuyerFeatures(buyerId: string, settings: Record<string, unknown>): BuyerFeatureState[] {
  if (!isBuyerId(buyerId)) throw new Error('Invalid buyer ID')
  return BUYER_FEATURES.map(feature => {
    const key = buyerFeatureKey(feature.id, buyerId)
    const override = settings[key]
    const mode = override === undefined ? 'default' : record(override).mode
    if (mode !== 'default' && mode !== 'enabled' && mode !== 'disabled') throw new Error('Invalid feature override')
    if (mode !== 'default') return { ...feature, mode, enabled: mode === 'enabled', source: 'admin' }
    const paid = record(record(settings.ia_ligacao_addon)[buyerId]).active === true
    const courtesy = record(settings.call_transcription).buyers
    const granted = Array.isArray(courtesy) && courtesy.includes(buyerId)
    return { ...feature, mode, enabled: paid || granted, source: paid ? 'subscription' : granted ? 'courtesy' : 'none' }
  })
}

export async function readBuyerFeatures(db: Db, buyerId: string): Promise<BuyerFeatureState[]> {
  if (!isBuyerId(buyerId)) throw new Error('Invalid buyer ID')
  const { data, error } = await db.from('settings').select('key, value').in('key', [
    'ia_ligacao_addon', 'call_transcription', ...BUYER_FEATURES.map(f => buyerFeatureKey(f.id, buyerId)),
  ])
  if (error) throw new Error('Feature access unavailable')
  return resolveBuyerFeatures(buyerId, Object.fromEntries((data || []).map(r => [r.key, r.value])))
}

export async function hasCallIA(db: Db, buyerId: string): Promise<boolean> {
  try { return (await readBuyerFeatures(db, buyerId)).some(f => f.id === 'ia_ligacao' && f.enabled) }
  catch { return false } // Fail closed for the paid accessory, not for the ordinary phone call.
}

/** From is Twilio's authenticated Voice SDK identity, unlike custom browser parameters. */
export function voiceBuyerIdentity(from: string | undefined): string | null {
  const id = from?.startsWith('client:') ? from.slice(7) : ''
  return isBuyerId(id) ? id : null
}
