import type { createAdminClient } from './supabase/admin'
type Db = ReturnType<typeof createAdminClient>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })
async function pages<T>(query: (start: number, end: number) => PromiseLike<{data: T[] | null; error: unknown}>) {
  const result: T[] = []
  for (let start = 0; ; start += 100) {
    const {data,error} = await query(start,start+99)
    if (error || !data) throw new Error('Read failed')
    result.push(...data)
    if (data.length < 100) return result
  }
}
/** Deliberately owner-only: pipeline sharing does not grant access to action settings. */
export function stageActionsAPI(db: Db, caller: () => Promise<{id: string; isAdmin: boolean} | null>) {
  return async (request: Request) => {
    try {
      const session = await caller()
      if (!session) return reply({error: 'Unauthorized'},401)
      const id = new URL(request.url).searchParams.get('pipeline_id')
      if (!id || !uuid.test(id)) return reply({error:'Invalid pipeline'},400)
      const {data:pipeline,error} = await db.from('pipelines').select('id').eq('id',id).eq('buyer_id',session.id).maybeSingle()
      if (error) throw error
      if (!pipeline) return reply({error:'Owner access required'},403)
      const stages = await pages((a,b)=>db.from('pipeline_stages').select('id').eq('pipeline_id',id).order('id').range(a,b))
      const result = []
      for (let offset=0; offset<stages.length; offset+=50) {
        const batch = stages.slice(offset,offset+50)
        const ids = batch.map(s=>s.id)
        const [sequences,automations] = await Promise.all([
          pages((a,b)=>db.from('sequences').select('id,name,enabled,trigger_stage_id').eq('buyer_id',session.id).in('trigger_stage_id',ids).order('id').range(a,b)),
          pages((a,b)=>db.from('automations').select('id,name,enabled,trigger_config').eq('buyer_id',session.id).in('trigger_type',['stage_entered','stage_stale']).in('trigger_config->>stage_id',ids).order('id').range(a,b)),
        ])
        const metadata = (item: {id: string; name: string; enabled: boolean}) => ({id:item.id,name:item.name,enabled:item.enabled})
        for (const s of batch) result.push({id:s.id,sequences:sequences.filter(x=>x.trigger_stage_id===s.id).map(metadata),automations:automations.filter(x=>x.trigger_config?.stage_id===s.id).map(metadata)})
      }
      return reply({pipeline_id:id,stages:result})
    } catch { return reply({error:'Stage actions unavailable'},503) }
  }
}
