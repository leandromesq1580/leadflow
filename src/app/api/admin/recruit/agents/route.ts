import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { RECRUIT_LANGS, RECRUIT_STATUSES } from '@/lib/recruit-agents'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const PAGE = 50
const COLS = 'id,email,name,phone,city,state,zip,license,npn,language,status,notes,first_seen_at,status_updated_at,suppressed_at,suppression_reason'

async function admin(request: NextRequest, write: boolean) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return { err: NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401, headers: NO_STORE }) }
  if (!caller.isAdmin) return { err: NextResponse.json({ error: 'Apenas administradores.' }, { status: 403, headers: NO_STORE }) }
  const origin = request.headers.get('origin')
  if (write && origin && origin !== request.nextUrl.origin) return { err: NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: NO_STORE }) }
  return { db }
}

/** GET /api/admin/recruit/agents?status=&state=&language=&q=&page=0 — agentes importados + contagem por status. */
export async function GET(request: NextRequest) {
  const a = await admin(request, false); if (a.err) return a.err
  const db = a.db!
  const sp = request.nextUrl.searchParams
  const page = Math.max(0, Math.min(10000, Number(sp.get('page') || '0') | 0))
  let q = db.from('recruit_agents').select(COLS, { count: 'exact' })
  const status = sp.get('status'), state = sp.get('state'), language = sp.get('language'), text = (sp.get('q') || '').trim().slice(0, 80)
  if (status && (RECRUIT_STATUSES as readonly string[]).includes(status)) q = q.eq('status', status)
  if (state && /^[A-Z]{2}$/.test(state)) q = q.eq('state', state)
  if (language && (RECRUIT_LANGS as string[]).includes(language)) q = q.eq('language', language)
  if (sp.get('suppressed') === '1') q = q.not('suppressed_at', 'is', null)
  if (text) {
    const t = text.replace(/[%_,()\\]/g, ' ').trim()
    if (t) q = q.or(`name.ilike.%${t}%,email.ilike.%${t}%,city.ilike.%${t}%,npn.ilike.%${t}%`)
  }
  const { data, count, error } = await q.order('first_seen_at', { ascending: false }).order('id').range(page * PAGE, page * PAGE + PAGE - 1)
  if (error) return NextResponse.json({ error: 'Não consegui ler os agentes.' }, { status: 500, headers: NO_STORE })
  const counts: Record<string, number> = {}
  for (const s of RECRUIT_STATUSES) {
    const { count: n } = await db.from('recruit_agents').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = n || 0
  }
  const { data: states } = await db.from('recruit_agents').select('state').limit(10000)
  const byState: Record<string, number> = {}
  for (const r of states || []) byState[r.state || '—'] = (byState[r.state || '—'] || 0) + 1
  return NextResponse.json({ agents: data || [], total: count || 0, page, pageSize: PAGE, counts, states: byState }, { headers: NO_STORE })
}

/** PATCH {id, status?, notes?, language?} — acompanhamento manual do recrutamento. */
export async function PATCH(request: NextRequest) {
  const a = await admin(request, true); if (a.err) return a.err
  const body = await request.json().catch(() => null)
  const id = body?.id
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400, headers: NO_STORE })
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!(RECRUIT_STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400, headers: NO_STORE })
    patch.status = body.status; patch.status_updated_at = new Date().toISOString()
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) return NextResponse.json({ error: 'Nota muito longa (máx. 2.000).' }, { status: 400, headers: NO_STORE })
    patch.notes = body.notes
  }
  if (body.language !== undefined) {
    if (!(RECRUIT_LANGS as string[]).includes(body.language)) return NextResponse.json({ error: 'Idioma inválido.' }, { status: 400, headers: NO_STORE })
    patch.language = body.language
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400, headers: NO_STORE })
  const { data, error } = await a.db!.from('recruit_agents').update(patch).eq('id', id).select(COLS).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Não consegui salvar.' }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ agent: data }, { headers: NO_STORE })
}
