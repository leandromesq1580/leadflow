export type AssignmentResult = {
  success: true; lead_id: string; source_lead_id: string; buyer_id: string
  assigned_at: string; remaining: number; replayed: boolean; notifications_pending?: boolean
}
type RpcResult = { data: unknown; error: { message?: string; code?: string } | null }
export type AssignmentPorts = {
  actor(): Promise<{ id: string; is_admin: boolean } | null>
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })
const errors: Record<string, [number, string]> = {
  unauthorized: [401, 'Não autenticado.'], forbidden: [403, 'Acesso exclusivo de administradores.'],
  invalid_request: [400, 'Pedido inválido.'], source_not_found: [404, 'Lead não encontrado.'],
  source_not_admin: [409, 'A origem deve pertencer a um administrador.'], source_unavailable: [409, 'Este lead não está disponível para nova entrega.'],
  contact_blocked: [409, 'Este contato possui bloqueio de comunicação.'], unsupported_language: [409, 'Não há créditos para o idioma deste lead.'],
  buyer_unavailable: [409, 'Destinatário indisponível.'], pipeline_unavailable: [409, 'O destinatário precisa de um único funil padrão com etapa.'],
  no_credit: [409, 'Saldo insuficiente no idioma do lead.'], request_conflict: [409, 'Este pedido já foi usado para outra entrega.'],
  source_already_delivered: [409, 'Este lead já foi entregue como novo.'], source_busy: [409, 'Há um envio em andamento ou sem confirmação nesta origem.'],
  readback_failed: [503, 'Não foi possível confirmar a entrega. Repita o mesmo pedido.'],
  unavailable: [503, 'Serviço temporariamente indisponível. Repita o mesmo pedido.'],
}
function failure(code: string) {
  const [status, error] = errors[code] || errors.unavailable
  return json({ error, code: errors[code] ? code : 'unavailable' }, status)
}
function rpcFailure(error: RpcResult['error']) {
  return failure(error?.message && errors[error.message] ? error.message : 'unavailable')
}
function result(value: unknown): value is AssignmentResult {
  if (!value || typeof value !== 'object') return false
  const r = value as AssignmentResult
  return r.success === true && uuid(r.lead_id) && uuid(r.source_lead_id) && uuid(r.buyer_id)
    && typeof r.assigned_at === 'string' && Number.isFinite(Date.parse(r.assigned_at))
    && Number.isSafeInteger(r.remaining) && typeof r.replayed === 'boolean'
}

/** No provider effects run from POST. The same DB transaction persists the outbox. */
export function createAdminNewLeadAssignmentHandlers(ports: AssignmentPorts) {
  async function authorized() {
    const actor = await ports.actor()
    return !actor ? failure('unauthorized') : !actor.is_admin ? failure('forbidden') : actor
  }
  return {
    async GET(request: Request) {
      try {
        const actor = await authorized(); if (actor instanceof Response) return actor
        const query = new URL(request.url).searchParams
        const source = query.get('lead_id'), cursor = query.get('cursor'), requestId = query.get('request_id')
        const search = (query.get('q') || '').trim()
        if (!uuid(source) || (cursor !== null && !uuid(cursor)) || (requestId !== null && !uuid(requestId)) || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search)) return failure('invalid_request')
        if (requestId) {
          const { data, error } = await ports.rpc('admin_new_lead_assignment_status', { p_actor: actor.id, p_source: source, p_request: requestId })
          if (error) return rpcFailure(error)
          if (data === null) return json({ pending: false, committed: false })
          return result(data) ? json(data) : failure('readback_failed')
        }
        const { data, error } = await ports.rpc('admin_new_lead_assignment_options', { p_actor: actor.id, p_source: source, p_query: search, p_cursor: cursor, p_limit: 50 })
        return error ? rpcFailure(error) : json(data)
      } catch { return failure('unavailable') }
    },
    async POST(request: Request) {
      try {
        const actor = await authorized(); if (actor instanceof Response) return actor
        const origin = request.headers.get('origin')
        if (origin && origin !== new URL(request.url).origin) return failure('forbidden')
        let body: Record<string, unknown>
        try {
          const raw = await request.text()
          if (raw.length > 4096) return failure('invalid_request')
          body = JSON.parse(raw)
        } catch { return failure('invalid_request') }
        if (!body || !uuid(body.lead_id) || !uuid(body.to_buyer_id) || !uuid(body.request_id)) return failure('invalid_request')
        const { data, error } = await ports.rpc('admin_assign_lead_as_new', { p_actor: actor.id, p_source: body.lead_id, p_buyer: body.to_buyer_id, p_request: body.request_id })
        if (error) return rpcFailure(error)
        if (!result(data)) return failure('readback_failed')
        const readback = await ports.rpc('admin_new_lead_assignment_status', { p_actor: actor.id, p_source: body.lead_id, p_request: body.request_id })
        if (readback.error || !result(readback.data)) return failure('readback_failed')
        const verified = readback.data
        if (verified.lead_id !== data.lead_id || verified.source_lead_id !== body.lead_id || verified.buyer_id !== body.to_buyer_id || verified.assigned_at !== data.assigned_at || verified.remaining !== data.remaining) return failure('readback_failed')
        return json({ ...verified, replayed: data.replayed })
      } catch { return failure('unavailable') }
    },
  }
}
