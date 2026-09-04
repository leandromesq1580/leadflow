export interface MetaFormLead {
  id: string
  created_time: string
  field_data?: { name: string; values?: string[] }[]
  form_id: string
  campaign_name?: string
  [key: string]: unknown
}

/** Read every page in the recovery window before distributing, oldest first. */
export async function fetchMetaFormLeads(
  formIds: string[],
  token: string,
  since: Date,
  fetcher: typeof fetch = fetch,
): Promise<MetaFormLead[]> {
  const leads = new Map<string, MetaFormLead>()
  for (const formId of formIds) {
    let after: string | undefined
    const cursors = new Set<string>()
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error(`Meta form ${formId}: pagination limit reached; checkpoint not advanced`)
      const url = new URL(`https://graph.facebook.com/v25.0/${formId}/leads`)
      url.searchParams.set('access_token', token)
      url.searchParams.set(
        'fields',
        'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id',
      )
      url.searchParams.set('limit', '100')
      url.searchParams.set(
        'filtering',
        JSON.stringify([
          { field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(since.getTime() / 1000) },
        ]),
      )
      if (after) url.searchParams.set('after', after)
      const res = await fetcher(url.toString(), { signal: AbortSignal.timeout(25000), cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || data.error || !Array.isArray(data.data)) {
        // Never log Graph paging URLs or access tokens.
        throw new Error(`Meta form ${formId}: HTTP ${res.status}, code ${data.error?.code || 'invalid_response'}`)
      }
      for (const lead of data.data) {
        if (!lead.id || !Number.isFinite(Date.parse(lead.created_time)))
          throw new Error(`Meta form ${formId}: invalid lead identity/date`)
        leads.set(lead.id, { ...lead, form_id: formId })
      }
      if (!data.paging?.next) break
      const next = data.paging?.cursors?.after
      if (!next || cursors.has(next)) throw new Error(`Meta form ${formId}: invalid pagination cursor`)
      cursors.add(next)
      after = next
    }
  }
  return [...leads.values()].sort(
    (a, b) => Date.parse(a.created_time) - Date.parse(b.created_time) || a.id.localeCompare(b.id),
  )
}

/** Single poll owner across manual runs, deployments and timer retries. */
export async function acquireMetaPollLease(db: any, owner: string, now = Date.now()): Promise<boolean> {
  const key = 'meta_poll_lease'
  const row = {
    key,
    value: { owner, expires_at: new Date(now + 10 * 60_000).toISOString() },
    updated_at: new Date(now).toISOString(),
  }
  let inserted = await db.from('settings').insert(row)
  if (!inserted.error) return true
  if (inserted.error.code !== '23505') throw inserted.error
  const current = await db.from('settings').select('value').eq('key', key).single()
  if (current.error) throw current.error
  if (Date.parse(current.data.value.expires_at) > now) return false
  const removed = await db.from('settings').delete().eq('key', key).eq('value->>owner', current.data.value.owner)
  if (removed.error) throw removed.error
  inserted = await db.from('settings').insert(row)
  if (inserted.error && inserted.error.code !== '23505') throw inserted.error
  return !inserted.error
}

export async function releaseMetaPollLease(db: any, owner: string) {
  const result = await db.from('settings').delete().eq('key', 'meta_poll_lease').eq('value->>owner', owner)
  if (result.error) throw result.error
}
