import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const validId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/** Session-only repair. SQL revalidates the actor, owner and stage under locks.
 * No legacy upsert, reassignment, credit mutation, sequence or message engine.
 */
export async function manualPipelineRequest(request: Request, leadId: string, adminOnly = false) {
  let attempted = false
  const unavailable = () => reply({ error: attempted ? 'Não foi possível confirmar. Tente novamente com a mesma seleção; o cartão não será movido.' : 'Não foi possível consultar o funil. Tente novamente.', reconcile_required: attempted }, 503)
  try {
    const supabase = await createServerSupabase()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return reply({ error: 'Sessão expirada. Entre novamente.' }, 401)
    if (!validId(leadId)) return reply({ error: 'Identificador inválido.' }, 400)
    const readOnly = request.method === 'GET'
    let pipeline: string | null = null
    let stage: string | null = null
    if (!readOnly) {
      let body: unknown
      try { body = await request.json() } catch { return reply({ error: 'Dados inválidos.' }, 400) }
      if (!object(body) || Object.keys(body).length !== 2 || !validId(body.pipeline_id) || !validId(body.stage_id)) {
        return reply({ error: 'Selecione um funil e um estágio válidos.' }, 400)
      }
      pipeline = body.pipeline_id
      stage = body.stage_id
    }
    const db = createAdminClient()
    attempted = !readOnly
    const result = await db.rpc('manual_lead_pipeline', { p_auth: user.id, p_lead: leadId, p_pipeline: pipeline, p_stage: stage, p_admin: adminOnly })
    if (result.error) {
      const code = result.error.code
      if (code === '42501') return reply({ error: 'Sem permissão para incluir este lead neste funil.' }, 403)
      if (code === 'P0002') return reply({ error: 'Lead não encontrado ou arquivado.' }, 404)
      if (code === '23505') return reply({ error: 'Este lead já tem cartão. Nenhum cartão foi movido; consulte o funil atual.' }, 409)
      if (code === '55P03' || code === '40P01') return reply({ error: 'Há outra operação em andamento. Tente novamente com a mesma seleção.' }, 409)
      return unavailable()
    }
    const data: unknown = result.data
    if (!object(data)) return unavailable()
    if (readOnly) {
      if (typeof data.eligible !== 'boolean' || !Array.isArray(data.pipelines)
        || data.pipelines.some(p => !object(p) || !validId(p.id) || typeof p.name !== 'string' || !Array.isArray(p.stages)
          || p.stages.some(s => !object(s) || !validId(s.id) || typeof s.name !== 'string'))) return unavailable()
      return reply({ eligible: data.eligible, pipelines: data.pipelines })
    }
    const entry = data.entry
    if (typeof data.changed !== 'boolean' || data.silent !== true || !object(entry) || !validId(entry.id)
      || entry.lead_id !== leadId || entry.pipeline_id !== pipeline || entry.stage_id !== stage) return unavailable()
    // A committed RPC is not enough: read back the exact target before confirming.
    const verified = await db.from('pipeline_leads').select('id,lead_id,pipeline_id,stage_id')
      .eq('id', entry.id).eq('lead_id', leadId).eq('pipeline_id', pipeline).eq('stage_id', stage).maybeSingle()
    if (verified.error || !verified.data || verified.data.id !== entry.id || verified.data.lead_id !== leadId
      || verified.data.pipeline_id !== pipeline || verified.data.stage_id !== stage) return unavailable()
    return reply({ success: true, changed: data.changed, silent: true, entry: verified.data })
  } catch {
    return unavailable()
  }
}
