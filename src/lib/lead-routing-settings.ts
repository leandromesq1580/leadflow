import type { createAdminClient } from './supabase/admin'

export interface LeadRoutingSettings {
  priority_only?: boolean
  [key: string]: unknown
}

/** JSONB compare-and-swap: no migration; retry against fresh data after concurrent writes. */
export async function updateLeadRouting(
  db: ReturnType<typeof createAdminClient>,
  change: (current: LeadRoutingSettings) => LeadRoutingSettings,
): Promise<LeadRoutingSettings> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readError } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
    if (readError) throw readError
    const value = change(row?.value || {})
    const payload = { value, updated_at: new Date().toISOString() }
    const { data, error } = row
      ? await db.from('settings').update(payload).eq('key', 'lead_routing').eq('value', JSON.stringify(row.value)).select('key').maybeSingle()
      : await db.from('settings').insert({ key: 'lead_routing', ...payload }).select('key').single()
    if (error && error.code !== '23505') throw error
    if (data && !error) return value
  }
  throw new Error('O roteamento mudou durante o salvamento. Tente novamente.')
}
