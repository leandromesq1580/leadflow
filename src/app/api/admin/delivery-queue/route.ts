import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/delivery-queue — Fila ÚNICA com integridade total.
 * Inclui o(s) admin(s) que interceptam por REGRA (1 a cada N, antes da fila de crédito)
 * + a fila de crédito (pagantes) + indica de quem é o PRÓXIMO lead.
 */
export const dynamic = 'force-dynamic'

// Inicio do dia (meia-noite) no fuso America/New_York, em ISO UTC. Robusto p/ EDT/EST.
function easternDayStartISO(): string {
  const now = new Date()
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now)
  const g = (t: string) => (p.find(x => x.type === t) as any).value
  const hh = g('hour') === '24' ? '00' : g('hour')
  const wallNow = `${g('year')}-${g('month')}-${g('day')}T${hh}:${g('minute')}:${g('second')}`
  const offsetMs = now.getTime() - new Date(wallNow + 'Z').getTime()
  const wallMidnight = `${g('year')}-${g('month')}-${g('day')}T00:00:00`
  return new Date(new Date(wallMidnight + 'Z').getTime() + offsetMs).toISOString()
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rt } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  const routing: any = rt?.value || {}
  const ar: any = routing.admin_rule || {}
  const N = Number(ar.one_in ?? ar.daily_quota ?? 0)
  const adminEmails: string[] = (ar.admin_emails || []).filter(Boolean)
  const fallbackEmail: string | null = routing.fallback_email || null

  // Vez do admin: posição = leads do sistema já distribuídos; admin pega quando (pos % N == 0)
  let leadsUntilAdmin: number | null = null, herTurnNow = false
  if (N > 0 && adminEmails.length) {
    const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).not('meta_lead_id', 'is', null).not('assigned_to', 'is', null)
    const pos = count || 0
    const nextAdminPos = Math.ceil((pos + 1) / N) * N
    leadsUntilAdmin = nextAdminPos - pos
    herTurnNow = leadsUntilAdmin === 1
  }

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
    const { data: ab } = await db.from('buyers').select('id, name, email').in('email', allAdminEmails).eq('is_active', true)
    const stMap = await statesOf((ab || []).map((b: any) => b.id))
    for (const b of (ab || [])) admins.push({
      id: b.id, nome: (b.name || '').trim(), email: b.email,
      estados: (stMap[b.id] || []).sort(),
      regraAdmin: adminEmails.includes(b.email) ? N : null,
      isFallback: b.email === fallbackEmail,
    })
  }
  const adminIds = new Set(admins.map(a => a.id))

  // FILA DE CRÉDITO (RPC) — exclui quem já está como admin pra não duplicar
  const { data: elig } = await db.rpc('get_eligible_buyers', { p_product_type: 'lead', p_state: null })
  const seen = new Map<string, { id: string; name: string; credits: number }>()
  for (const e of (elig || [])) {
    if (adminIds.has(e.id)) continue
    const cur = seen.get(e.id)
    if (cur) { cur.credits += Number(e.remaining) || 0; continue }
    seen.set(e.id, { id: e.id, name: (e.name || '').trim(), credits: Number(e.remaining) || 0 })
  }
  let queue = [...seen.values()]
  // 🟢 PISO DIARIO: quem ainda NAO recebeu lead de sistema hoje (meia-noite Eastern) vem
  // PRIMEIRO (ordenado por saldo), depois quem ja recebeu. Reflete a regra de distribuicao.
  const dayStart = easternDayStartISO()
  const { data: todayLeads } = await db.from('leads').select('assigned_to')
    .in('assigned_to', queue.map(q => q.id)).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
  const gotToday = new Set((todayLeads || []).map((l: any) => l.assigned_to))
  queue = queue.sort((a, b) => {
    const ag = gotToday.has(a.id) ? 1 : 0, bg = gotToday.has(b.id) ? 1 : 0
    if (ag !== bg) return ag - bg
    return b.credits - a.credits
  })
  const stMap2 = await statesOf(queue.map(q => q.id))
  const fila = queue.map((q, i) => ({ pos: i + 1, id: q.id, nome: q.name, creditos: q.credits, estados: (stMap2[q.id] || []).sort(), recebeuHoje: gotToday.has(q.id) }))

  return NextResponse.json({ adminRule: { N, leadsUntilAdmin, herTurnNow }, admins, fila })
}
