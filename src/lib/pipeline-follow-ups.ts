import type { SupabaseClient } from '@supabase/supabase-js'

export interface LastFollowUp {
  type: string
  description?: string | null
  scheduled_at: string | null
  created_at: string
}

export const FOLLOW_UP_LOAD_ERROR = 'Não foi possível carregar os follow-ups. Tente novamente.'

/** Only pass lead IDs from the authorized pipeline. Never cache across requests. */
export async function latestPipelineFollowUps(db: SupabaseClient, leadIds: string[], options: { scheduledFirst?: boolean } = {}) {
  const latest: Record<string, LastFollowUp> = Object.create(null)
  const ids = [...new Set(leadIds)]
  const BATCH = 50 // Keep PostgREST UUID filters comfortably below URL limits.
  const PAGE = 1000
  for (let start = 0; start < ids.length; start += BATCH) {
    const batch = ids.slice(start, start + BATCH)
    for (let offset = 0; ; offset += PAGE) {
      let query = db.from('follow_ups')
        .select('lead_id, type, description, scheduled_at, created_at')
        .in('lead_id', batch)
      // Preserve the pseudo-pipeline's existing scheduled-first semantics.
      if (options.scheduledFirst) query = query.order('scheduled_at', { ascending: false, nullsFirst: false })
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error || !data) throw new Error(FOLLOW_UP_LOAD_ERROR)
      for (const fu of data) {
        if (batch.includes(fu.lead_id) && !latest[fu.lead_id]) latest[fu.lead_id] = fu
      }
      if (data.length < PAGE || batch.every(id => latest[id])) break
    }
  }
  return latest
}
