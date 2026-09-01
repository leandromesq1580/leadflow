import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminDailyBlock, adminRuleTurn, easternDayStartISO, evaluateAdminRule } from '@/lib/admin-rule'
import { readAdminRuleState } from '@/lib/admin-rule-state'
import { readBuyerPolicy } from '@/lib/buyer-policy'

/**
 * GET /api/admin/delivery-queue — Fila ÚNICA com integridade total.
 * Inclui o(s) admin(s) que interceptam por REGRA (1 a cada N, antes da fila de crédito)
 * + a fila de crédito (pagantes) + indica de quem é o PRÓXIMO lead.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { staffIds } = await readBuyerPolicy(db)

  const { data: rt, error: routingError } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  if (routingError) return NextResponse.json({ error: 'Não foi possível verificar o roteamento.' }, { status: 503 })
  const routing: any = rt?.value || {}
  const ar: any = routing.admin_rule || {}
  const adminEmails: string[] = (ar.admin_emails || []).map((e: string) => e.trim().toLowerCase()).filter(Boolean)
  const fallbackEmail: string | null = routing.fallback_email || null
  const queueOrder: string = routing.queue_order || 'credito'

  // The preview and actual delivery share the same state, license and daily-cap checks.
  let snapshot
  try { snapshot = await readAdminRuleState(db, ar) } catch (error) {
    console.error('[Delivery queue] Could not read admin rule:', error)
    return NextResponse.json({ error: 'Não foi possível verificar a regra de prioridade.' }, { status: 503 })
  }
  const { N, leadsUntilAdmin, isTurn } = adminRuleTurn(ar, snapshot.assignedCount)
  const coveredStates = [...new Set(snapshot.candidates.flatMap(c => c.states))]
  const nextCandidateIds = [...new Set(coveredStates.flatMap(state => {
    const d = evaluateAdminRule(ar, snapshot.assignedCount, snapshot.candidates, state)
    return d.isTurn && d.eligible && d.candidate ? [d.candidate.id] : []
  }))]
  const herTurnNow = nextCandidateIds.length > 0
  const ruleAvailable = snapshot.candidates.some(c => c.is_active && c.states.length && !adminDailyBlock(ar, c.receivedToday))

  // estados de um conjunto de buyer ids
  async function statesOf(ids: string[]) {
    const map: Record<string, string[]> = {}
    if (ids.length) { const { data: st } = await db.from('buyer_states').select('buyer_id, state_code').in('buyer_id', ids); for (const s of (st || [])) (map[s.buyer_id] ||= []).push(s.state_code) }
    return map
  }

  // ADMINS (regra + fallback)
  const allAdminEmails = [...new Set([...adminEmails, ...(fallbackEmail ? [fallbackEmail] : [])])]
  const admins: any[] = []
  if (allAdminEmails.length) {
    const { data: ab } = await db.from('buyers').select('id, name, email, is_active').in('email', allAdminEmails)
    const stMap = await statesOf((ab || []).map((b: any) => b.id))
    for (const b of (ab || []).filter(b => !staffIds.has(b.id) || adminEmails.includes(b.email.toLowerCase()))) admins.push({
      id: b.id, nome: (b.name || '').trim(), email: b.email,
      estados: (stMap[b.id] || []).sort(),
      regraAdmin: adminEmails.includes(b.email.toLowerCase()) ? N : null,
      isFallback: !staffIds.has(b.id) && b.email === fallbackEmail,
      receivedToday: snapshot.candidates.find(c => c.id === b.id)?.receivedToday || 0,
      dailyMax: ar.daily_max ?? null,
      blockedReason: !b.is_active ? 'inactive' : !(stMap[b.id] || []).length ? 'no_license'
        : adminEmails.includes(b.email.toLowerCase()) ? adminDailyBlock(ar, snapshot.candidates.find(c => c.id === b.id)?.receivedToday || 0) : null,
      isNext: nextCandidateIds.includes(b.id),
      isStaff: staffIds.has(b.id),
    })
  }
  const adminIds = new Set(admins.map(a => a.id))

  // FILA DE CRÉDITO (RPC) — exclui quem já está como admin pra não duplicar
  const { data: elig } = await db.rpc('get_eligible_buyers', { p_product_type: 'lead', p_state: null })
  const seen = new Map<string, { id: string; name: string; credits: number; leads_count: number }>()
  for (const e of (elig || [])) {
    if (adminIds.has(e.id) || staffIds.has(e.id)) continue
    const cur = seen.get(e.id)
    if (cur) { cur.credits += Number(e.remaining) || 0; continue }
    seen.set(e.id, { id: e.id, name: (e.name || '').trim(), credits: Number(e.remaining) || 0, leads_count: Number(e.leads_count) || 0 })
  }
  let queue = [...seen.values()]
  // 🟢 PISO DIARIO: quem ainda NAO recebeu lead de sistema hoje (meia-noite Eastern) vem
  // PRIMEIRO (ordenado por saldo), depois quem ja recebeu. Reflete a regra de distribuicao.
  const dayStart = easternDayStartISO()
  const { data: todayLeads } = await db.from('leads').select('assigned_to')
    .in('assigned_to', queue.map(q => q.id)).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
  const gotToday = new Set((todayLeads || []).map((l: any) => l.assigned_to))
  // Ordena pela regra escolhida (queue_order), dentro dos grupos do piso (nao-hoje 1o).
  const createdAt: Record<string, number> = {}
  if (queueOrder !== 'credito') {
    const { data: cr } = await db.from('buyers').select('id, created_at').in('id', queue.map(q => q.id))
    for (const r of cr || []) createdAt[r.id] = new Date(r.created_at as string).getTime()
  }
  const cmpRegra = (modo: string, a: any, b: any) => {
    if (modo === 'antiguidade') return (createdAt[a.id] || 0) - (createdAt[b.id] || 0)
    if (modo === 'rodizio') return (a.leads_count - b.leads_count) || ((createdAt[a.id] || 0) - (createdAt[b.id] || 0))
    return b.credits - a.credits // credito
  }
  queue = queue.sort((a, b) => {
    const ag = gotToday.has(a.id) ? 1 : 0, bg = gotToday.has(b.id) ? 1 : 0
    if (ag !== bg) return ag - bg // piso: quem nao recebeu hoje primeiro
    if (queueOrder === 'hibrido') return cmpRegra(ag === 0 ? 'antiguidade' : 'credito', a, b)
    return cmpRegra(queueOrder, a, b)
  })
  const stMap2 = await statesOf(queue.map(q => q.id))
  const fila = queue.map((q, i) => ({ pos: i + 1, id: q.id, nome: q.name, creditos: q.credits, estados: (stMap2[q.id] || []).sort(), recebeuHoje: gotToday.has(q.id) }))

  return NextResponse.json({ adminRule: { N, leadsUntilAdmin, herTurnNow, isTurn, ruleAvailable, nextCandidateIds, dailyMax: ar.daily_max ?? null }, queueOrder, admins, fila }, { headers: { 'Cache-Control': 'private, no-store' } })
}
