import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { callerBuyer } from '@/lib/api-auth'
import { campaignConfiguration, CAMPAIGN_UUID } from '@/lib/email-campaigns'
import { campaignProvider } from '@/lib/email-campaign-provider'
import { RECRUIT_LANGS, RECRUIT_MODULE_TAG, RECRUIT_TEMPLATE, hasPlaceholder, renderRecruitEmail, validateRecruitCampaign, validateRecruitFilters, type RecruitLang } from '@/lib/recruit-agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE })
const KNOWN: Record<string, string> = {
  campaign_not_found: 'Campanha não encontrada.', draft_required: 'Só rascunhos podem ser agendados ou editados.',
  empty_audience: 'Nenhum agente elegível com esses filtros.', audience_changed: 'A lista mudou desde que você a viu. Confira os números e confirme de novo.',
  invalid_transition: 'Essa ação não está disponível agora.', invalid_schedule: 'Data inválida.',
}

async function auth(request: NextRequest, write: boolean) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return { err: fail('Entre novamente na sua conta.', 401) }
  if (!caller.isAdmin) return { err: fail('Apenas administradores.', 403) }
  const origin = request.headers.get('origin')
  if (write && origin && origin !== request.nextUrl.origin) return { err: fail('Origem inválida.', 403) }
  return { db, caller }
}

async function rpc<T>(db: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) {
    const m = String((error as { message?: string }).message || '')
    const k = Object.keys(KNOWN).find(x => m.includes(x))
    throw new Error(k ? KNOWN[k] : 'Erro no banco de dados.')
  }
  return data as T
}

export async function GET(request: NextRequest) {
  const a = await auth(request, false); if (a.err) return a.err
  try {
    const cfg = campaignConfiguration(process.env)
    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      if (!CAMPAIGN_UUID.test(id)) return fail('Campanha inválida.')
      const { data } = await a.db!.from('recruit_campaigns').select('*').eq('id', id).maybeSingle()
      return data ? NextResponse.json({ campaign: data }, { headers: NO_STORE }) : fail('Campanha não encontrada.', 404)
    }
    const campaigns = await rpc(a.db!, 'rc_list')
    return NextResponse.json({ campaigns, template: RECRUIT_TEMPLATE, config: { ready: cfg.ready, issues: cfg.issues, from: cfg.from, dailyLimit: cfg.dailyLimit } }, { headers: NO_STORE })
  } catch (e) { return fail(e instanceof Error ? e.message : 'Falha.', 500) }
}

/** POST {action: audience|create|update|schedule|control|test, ...} */
export async function POST(request: NextRequest) {
  const a = await auth(request, true); if (a.err) return a.err
  const db = a.db!, caller = a.caller!
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Pedido inválido.')
  try {
    switch (body.action) {
      case 'audience': {
        const f = validateRecruitFilters(body.filters); if (!f.ok) return fail(f.error)
        return NextResponse.json({ audience: await rpc(db, 'rc_audience', { p_filters: f.value }) }, { headers: NO_STORE })
      }
      case 'create':
      case 'update': {
        const v = validateRecruitCampaign(body.campaign); if (!v.ok) return fail(v.error)
        if (body.action === 'create') {
          const { data, error } = await db.from('recruit_campaigns').insert({ ...v.value, created_by: caller.id }).select('*').single()
          if (error) return fail('Não consegui criar a campanha.', 500)
          return NextResponse.json({ campaign: data }, { headers: NO_STORE })
        }
        if (typeof body.id !== 'string' || !CAMPAIGN_UUID.test(body.id)) return fail('Campanha inválida.')
        const { data, error } = await db.from('recruit_campaigns').update({ ...v.value, updated_at: new Date().toISOString() }).eq('id', body.id).eq('state', 'draft').select('*').maybeSingle()
        if (error) return fail('Não consegui salvar.', 500)
        return data ? NextResponse.json({ campaign: data }, { headers: NO_STORE }) : fail(KNOWN.draft_required)
      }
      case 'schedule': {
        if (typeof body.id !== 'string' || !CAMPAIGN_UUID.test(body.id)) return fail('Campanha inválida.')
        if (body.confirm !== true) return fail('Confirmação necessária.')
        const expected = Number(body.expected)
        if (!Number.isInteger(expected) || expected < 1) return fail('Informe quantos destinatários você conferiu.')
        const cfg = campaignConfiguration(process.env)
        if (!cfg.ready) return fail('Envio de e-mail não está pronto: ' + cfg.issues.join(' '))
        const { data: c } = await db.from('recruit_campaigns').select('*').eq('id', body.id).maybeSingle()
        if (!c) return fail('Campanha não encontrada.', 404)
        if (hasPlaceholder(c)) return fail('Ainda há trechos [[PREENCHER…]] no texto. Troque pelos dados reais nos 3 idiomas antes de agendar.')
        const at = body.at ? new Date(body.at) : new Date()
        if (Number.isNaN(at.getTime())) return fail('Data inválida.')
        const out = await rpc(db, 'rc_schedule', { p_actor: caller.id, p_id: body.id, p_at: at.toISOString(), p_expected: expected })
        return NextResponse.json({ campaign: out }, { headers: NO_STORE })
      }
      case 'control': {
        if (typeof body.id !== 'string' || !CAMPAIGN_UUID.test(body.id) || !['pause', 'resume', 'cancel'].includes(body.control)) return fail('Pedido inválido.')
        return NextResponse.json({ campaign: await rpc(db, 'rc_control', { p_id: body.id, p_action: body.control }) }, { headers: NO_STORE })
      }
      case 'test': {
        // Envia UM e-mail de teste só para o e-mail do admin logado (não toca em nenhum agente).
        if (typeof body.id !== 'string' || !CAMPAIGN_UUID.test(body.id) || !RECRUIT_LANGS.includes(body.language)) return fail('Pedido inválido.')
        const cfg = campaignConfiguration(process.env)
        if (!cfg.ready) return fail('Envio de e-mail não está pronto: ' + cfg.issues.join(' '))
        const session = await createServerSupabase()
        const email = (await session.auth.getUser()).data.user?.email
        if (!email) return fail('Não achei o seu e-mail.')
        const { data: c } = await db.from('recruit_campaigns').select('*').eq('id', body.id).maybeSingle()
        if (!c) return fail('Campanha não encontrada.', 404)
        const copy = renderRecruitEmail({ name: 'Teste', language: body.language as RecruitLang, unsubscribe_token: '00000000-0000-4000-8000-000000000000', campaign: c }, cfg)
        const r = await campaignProvider(cfg).send({ from: cfg.from, to: [email], ...copy, subject: '[TESTE] ' + copy.subject, tags: [{ name: 'module', value: RECRUIT_MODULE_TAG + '_test' }] }, { idempotencyKey: 'l4p-recruit-test-' + crypto.randomUUID() })
        return r.data?.id ? NextResponse.json({ sentTo: email }, { headers: NO_STORE }) : fail('O provedor recusou o envio de teste.', 502)
      }
      default: return fail('Ação desconhecida.')
    }
  } catch (e) { return fail(e instanceof Error ? e.message : 'Falha.', 500) }
}
