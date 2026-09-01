import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/** Staff is explicit, not inferred from admin permissions, credit balance or a courtesy plan. */
export async function readBuyerPolicy(db: Db) {
  const { data, error } = await db.from('settings').select('key, value').in('key', ['staff_buyers', 'metrics_exclude_buyers'])
  if (error) throw error // Do not silently put staff back in the paying-customer queue.
  const ids = (key: string): string[] => {
    const value = (data || []).find(row => row.key === key)?.value as { buyers?: unknown } | undefined
    if (!value) return []
    if (!Array.isArray(value.buyers) || value.buyers.some(id => typeof id !== 'string')) throw new Error(`Invalid buyer policy: ${key}`)
    return value.buyers
  }
  const staffIds = new Set(ids('staff_buyers'))
  const metricsExcludedIds = new Set([...ids('metrics_exclude_buyers'), ...staffIds])
  return { staffIds, metricsExcludedIds }
}

export function withoutStaff<T extends { id: string }>(buyers: T[], staffIds: Set<string>): T[] {
  return buyers.filter(buyer => !staffIds.has(buyer.id))
}
