import { createAdminClient } from './supabase/admin'
import { orientarPendencia, type PolicyChangeAlert, type PolicyStatus } from './insurance-policies'
import {
  EMPTY_CLIENT_INTELLIGENCE,
  type PolicyPortalSnapshot,
  type PortalClientIntelligenceEvent,
  type PortalCommunication,
  type PortalRequirement,
} from './policy-portal'

/**
 * CONECTOR NATIONAL LIFE — mantém o book de apólices vivo dentro do Lead4Pro.
 *
 * O agente que lê o portal da seguradora publica um JSON (in force, new business,
 * requisitos em aberto, avisos de lapse e as aplicações do iGo que ainda não foram
 * processadas). Aqui a gente traz isso pra tabela `policies` do corretor.
 *
 * REGRA DE OURO: a seguradora manda no que é FATO (status, pendências, datas, dívida);
 * o corretor manda no que é DECISÃO (ação escrita, anotações, contato, marcado como feito).
 * A sincronização nunca sobrescreve o trabalho do corretor.
 *
 * Configuração (settings.nl_agent, sem deploy):
 *   { "<buyer_id>": { "url": "https://…/nl-agent", "key": "…", "agent": "484G2" } }
 */

type Db = ReturnType<typeof createAdminClient>

export interface NLConfig {
  url: string
  key: string
  agent?: string
  last_sync?: string
  /** id do cliente no robô multi-tenant (buyer_id); ausente = instância raiz (legado) */
  client?: string
}

/** monta a query com a chave e, quando multi-tenant, o cliente */
const q = (cfg: NLConfig, comKey: boolean) => {
  const p = new URLSearchParams()
  if (comKey) p.set('k', cfg.key)
  if (cfg.client) p.set('client', cfg.client)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface NLResultado {
  ok: boolean
  novas: number
  atualizadas: number
  semMudanca: number
  geradoEm?: string | null
  portalAtualizadoEm?: string | null
  mudancas?: PolicyChangeAlert[]
  avisosEnviados?: boolean
  erro?: string
}

export interface NLStatusRobo {
  running: boolean
  awaiting_mfa: boolean
  last_run: string | null
  last_error: string | null
  portal_last_updated?: string | null
}

/** Acorda o robô que varre o portal de verdade (Playwright no servidor). */
export async function dispararVarredura(cfg: NLConfig): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/run${q(cfg, true)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
    })
    if (!r.ok) return { ok: false, erro: `robô respondeu ${r.status}` }
    return { ok: true }
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) } }
}

/** Entrega o código MFA (que chegou no e-mail do agente) pro robô continuar. */
export async function enviarCodigoMfa(cfg: NLConfig, code: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/mfa${q(cfg, true)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d?.ok === false) return { ok: false, erro: d?.error || `robô respondeu ${r.status}` }
    return { ok: true }
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) } }
}

/** O robô está varrendo? Pediu MFA? Quando varreu por último? */
export async function statusVarredura(cfg: NLConfig): Promise<NLStatusRobo | null> {
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/status${q(cfg, false)}`, {
      cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = await r.json()
    return {
      running: !!d.running, awaiting_mfa: !!d.awaiting_mfa,
      last_run: d.last_run || null, last_error: d.last_error || null,
      portal_last_updated: d.portal_last_updated || null,
    }
  } catch { return null }
}

/** Configuração do conector deste corretor (null = não conectado). */
export async function conectorDe(db: Db, buyerId: string): Promise<NLConfig | null> {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
    const mapa = ((data?.value as any) || {}) as Record<string, NLConfig>
    const c = mapa[buyerId]
    return c?.url && c?.key ? c : null
  } catch { return null }
}

async function marcarSync(db: Db, buyerId: string) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
    const mapa = ((data?.value as any) || {}) as Record<string, NLConfig>
    if (!mapa[buyerId]) return
    mapa[buyerId] = { ...mapa[buyerId], last_sync: new Date().toISOString() }
    await db.from('settings').upsert({ key: 'nl_agent', value: mapa, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch {}
}

/* ---------- normalização ---------- */

/** LS237204800 → LS2372048 (o portal acrescenta um sufixo de 2 dígitos em algumas telas). */
export function normPol(pol?: string | null): string | null {
  if (!pol) return null
  const s = String(pol).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return null
  const pre = (s.match(/^[A-Z]+/) || [''])[0]
  let num = s.slice(pre.length)
  if (num.length === 9 && num.endsWith('00')) num = num.slice(0, 7)
  return (pre || 'LS') + num
}

const chaveNome = (n?: string | null) => (n || '').toUpperCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2).sort().join(' ')

/** "Cunha, Allan Fernandes" → "Allan Fernandes Cunha" */
function nomeDireito(n: string): string {
  if (!n.includes(',')) return n
  const [sob, resto] = n.split(',')
  return `${resto.trim()} ${sob.trim()}`.replace(/\s+/g, ' ').trim()
}
const titulo = (n: string) => n.split(' ')
  .map(w => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ')

/** Primeiro valor monetário do texto → centavos. "$500,000 (FlexLife 2025)" → 50000000 */
function centavos(v?: string | null): number | null {
  if (!v) return null
  const m = /\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d{1,2})?)/.exec(String(v))
  if (!m) return null
  const bruto = /,\d{3}/.test(m[1]) ? m[1].replace(/,/g, '') : m[1].replace(',', '.')
  const n = parseFloat(bruto)
  return isFinite(n) ? Math.round(n * 100) : null
}

/** "07/13/2026" (formato do portal, US) → "2026-07-13" */
function dataUS(s?: string | null): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''))
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

function inteiro(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? Math.round(Number(m[0])) : fallback
}

function requisitosPortal(txt: unknown): PortalRequirement[] {
  const texto = String(txt || '').trim()
  if (!texto) return []
  const out: PortalRequirement[] = []
  for (const m of texto.matchAll(/\[(\d{2}\/\d{2}\/\d{4})\]\s*([^[]+)/g)) {
    const name = m[2].trim().replace(/^LSW\s+/, '')
    if (name) out.push({ name, received_at: dataUS(m[1]) })
  }
  if (!out.length) out.push({ name: texto.replace(/^LSW\s+/, ''), received_at: null })
  return out
}

/** Snapshot completo usado pelas abas New Business e Client Intelligence. */
export function snapshotDoFeed(d: any): PolicyPortalSnapshot {
  const summary = d?.nb_summary || {}
  const exact = [
    'all', 'pending', 'at_risk_chargeback', 'pending_requirements',
    'outstanding_edelivery', 'pending_eft', 'unread_messages',
    'anticipated_annual_premium', 'modal_premium',
  ].every(key => summary[key] !== undefined && summary[key] !== null)
  const estorno = new Set((d?.estorno || []).map((p: unknown) => normPol(String(p))).filter(Boolean))
  const cases = (d?.nb_rows || []).map((r: any) => {
    const policy = normPol(r.pol)
    const uw = (policy && (d?.uw_cases?.[r.pol] || d?.uw_cases?.[policy])) || {}
    const communications: PortalCommunication[] = (uw?.comms || []).map((c: any) => ({
      author: c?.quem || null,
      sent_at: c?.quando || null,
      text: String(c?.texto || '').trim(),
    })).filter((c: PortalCommunication) => c.text)
    const requirements = requisitosPortal((policy && (d?.reqs?.[r.pol] || d?.reqs?.[policy])) || '')
    return {
      policy_number: policy,
      policy_id: null,
      client_name: String(r.name || r.owner || '').trim(),
      owner: r.owner || null,
      submitted_at: dataUS(r.sub),
      sent_at: dataUS(r.sent),
      annual_premium_cents: centavos(r.aap),
      modal_premium_cents: centavos(r.mp),
      product: r.prod || null,
      portal_status: r.st || null,
      delivery_status: r.deliv || null,
      case_manager: r.cm || null,
      underwriter: uw?.underwriter || null,
      underwriting_tracker: uw?.tracker || null,
      requirements,
      communications,
      at_risk_chargeback: !!(policy && estorno.has(policy)),
    }
  })

  const ci = d?.client_intelligence || {}
  const ciHeaders = Array.isArray(ci.headers) ? ci.headers.map(String) : []
  const ciEvents: PortalClientIntelligenceEvent[] = (ci.rows || []).map((row: any, index: number) => {
    const columns = (row?.columns && typeof row.columns === 'object')
      ? Object.fromEntries(Object.entries(row.columns).map(([k, v]) => [String(k), String(v ?? '')]))
      : Object.fromEntries(ciHeaders.map((header: string, i: number) => [header, String(row?.cells?.[i] ?? '')]))
    const find = (patterns: RegExp[]) => {
      const entry = Object.entries(columns).find(([key]) => patterns.some(p => p.test(key)))
      return entry?.[1] || null
    }
    const policy = normPol(row?.policy_number || find([/policy/i, /ap[oó]lice/i]))
    const client = row?.client_name || find([/client/i, /owner/i, /insured/i, /cliente/i])
    const occurred = row?.occurred_at || find([/date/i, /data/i, /received/i])
    const portalCategory = (row?.category && row.category !== 'all')
      ? String(row.category)
      : (find([/^category$/i, /categoria/i]) || 'all')
    const category = portalCategory.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'all'
    return {
      id: String(row?.id || `${row?.category || 'all'}-${policy || client || index}-${index}`),
      category,
      policy_number: policy,
      policy_id: null,
      client_name: client || null,
      occurred_at: occurred || null,
      portal_url: row?.portal_url || null,
      flags: row?.commission_impact ? ['commission_impact'] : [],
      columns,
    }
  })

  const annualFallback = cases.reduce((sum: number, item: any) => sum + (item.annual_premium_cents || 0), 0)
  const modalFallback = cases.reduce((sum: number, item: any) => sum + (item.modal_premium_cents || 0), 0)
  const pending = cases.filter((item: any) => /pending/i.test(item.portal_status || '')).length
  const outstandingEdelivery = cases.filter((item: any) => /edelivery/i.test(item.delivery_status || '') && !/completed|locked/i.test(item.delivery_status || '')).length

  return {
    carrier: 'National Life',
    generated_at: d?.generated_at || null,
    portal_last_updated: d?.portal_last_updated || null,
    new_business: {
      metrics: {
        all: inteiro(summary.all, cases.length),
        pending: inteiro(summary.pending, pending),
        at_risk_chargeback: inteiro(summary.at_risk_chargeback, estorno.size),
        pending_requirements: inteiro(summary.pending_requirements, Object.keys(d?.reqs || {}).length),
        outstanding_edelivery: inteiro(summary.outstanding_edelivery, outstandingEdelivery),
        pending_eft: inteiro(summary.pending_eft, 0),
        unread_messages: inteiro(summary.unread_messages, 0),
        anticipated_annual_premium_cents: centavos(summary.anticipated_annual_premium) ?? annualFallback,
        modal_premium_cents: centavos(summary.modal_premium) ?? modalFallback,
        exact_portal_totals: exact,
      },
      cases,
    },
    client_intelligence: {
      ...EMPTY_CLIENT_INTELLIGENCE,
      available: !!ci.available,
      error: ci.error || null,
      portal_url: ci.portal_url || null,
      metrics: (ci.metrics && typeof ci.metrics === 'object')
        ? Object.fromEntries(Object.entries(ci.metrics).map(([key, value]) => [key, inteiro(value)]))
        : {},
      columns: ciHeaders,
      events: ciEvents,
    },
    changes: (d?.changes || []).map((change: any) => ({
      policy: String(change?.pol || ''),
      kind: String(change?.kind || ''),
      change: String(change?.change || ''),
    })),
  }
}

async function salvarSnapshot(db: Db, buyerId: string, snapshot: PolicyPortalSnapshot) {
  const key = 'policies_portal_snapshot'
  const { data } = await db.from('settings').select('value').eq('key', key).maybeSingle()
  const map = ((data?.value as Record<string, PolicyPortalSnapshot>) || {})
  map[buyerId] = snapshot
  await db.from('settings').upsert({ key, value: map, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

export async function snapshotApolicesDe(db: Db, buyerId: string): Promise<PolicyPortalSnapshot | null> {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'policies_portal_snapshot').maybeSingle()
    return ((data?.value as Record<string, PolicyPortalSnapshot>) || {})[buyerId] || null
  } catch {
    return null
  }
}

const POLICY_ALERTS_KEY = 'policy_change_alerts'

export async function alertasApolicesDe(db: Db, buyerId: string): Promise<PolicyChangeAlert[]> {
  try {
    const { data } = await db.from('settings').select('value').eq('key', POLICY_ALERTS_KEY).maybeSingle()
    const map = ((data?.value as Record<string, PolicyChangeAlert[]>) || {})
    const cutoff = Date.now() - 30 * 86400_000
    return (map[buyerId] || []).filter(item => new Date(item.created_at).getTime() >= cutoff).slice(0, 100)
  } catch {
    return []
  }
}

async function salvarAlertasApolices(db: Db, buyerId: string, alerts: PolicyChangeAlert[]) {
  if (!alerts.length) return
  const { data } = await db.from('settings').select('value').eq('key', POLICY_ALERTS_KEY).maybeSingle()
  const map = ((data?.value as Record<string, PolicyChangeAlert[]>) || {})
  const previous = map[buyerId] || []
  const ids = new Set<string>()
  map[buyerId] = [...alerts, ...previous].filter(item => {
    if (!item?.id || ids.has(item.id)) return false
    ids.add(item.id)
    return true
  }).slice(0, 100)
  await db.from('settings').upsert({ key: POLICY_ALERTS_KEY, value: map, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

function novoAlerta(base: Omit<PolicyChangeAlert, 'id' | 'created_at'>): PolicyChangeAlert {
  return { ...base, id: crypto.randomUUID(), created_at: new Date().toISOString() }
}

function statusPortal(st?: string | null): PolicyStatus | null {
  const s = String(st || '')
  if (/lapsed/i.test(s)) return 'lapsed'
  if (/pending lapse/i.test(s)) return 'at_risk'
  // NB "Pending" = caso em análise na seguradora (cartão "novos negócios em
  // análise" do portal — incidente 17/08: os 8 casos sumiam num 'submitted' genérico)
  if (/pending|pendente/i.test(s)) return 'in_review'
  if (/approved/i.test(s)) return 'issued'
  if (/active|in ?force/i.test(s)) return 'active'
  if (/issued/i.test(s)) return 'issued'
  if (/incomplete|closed|declin|withdraw/i.test(s)) return 'declined'
  return null
}

/* ---------- montagem a partir do feed ---------- */

interface Registro {
  policy_number: string | null
  client_name: string
  product?: string | null
  premium_cents?: number | null
  coverage_cents?: number | null
  status?: PolicyStatus | null
  submitted_at?: string | null
  issued_at?: string | null
  effective_date?: string | null
  requirements: string[]
  amount_due_cents?: number | null
  due_date?: string | null
  client_phone?: string | null
  client_email?: string | null
  _dias?: number | null
  /** veio só do iGo (nunca apareceu no portal) — não serve pra reabrir caso encerrado */
  _igo?: boolean
  /** histórico do Case Communication (portal) — quem/quando/texto */
  _comms?: { quem: string | null; quando: string | null; texto: string }[] | null
  /** o portal falou sobre as pendências desta apólice nesta leitura */
  _fonteReq?: boolean
  /** o portal confirmou a entrega eletrônica assinada */
  _edeliveryOk?: boolean
}

export function montarDoFeed(d: any): Registro[] {
  const lista: Registro[] = []
  const porPol = new Map<string, Registro>()
  const porNome = new Map<string, Registro>()

  /** Casa por número de apólice; nome só quando não há número dos dois lados
   *  (senão duas apólices do mesmo dono viravam uma só). */
  const pegar = (pol: string | null, nome: string): Registro => {
    const nk = chaveNome(nome)
    if (pol) {
      const achado = porPol.get(pol)
      if (achado) return achado
      const cand = porNome.get(nk)
      if (cand && !cand.policy_number) { cand.policy_number = pol; porPol.set(pol, cand); return cand }
      const novo: Registro = { policy_number: pol, client_name: nome, requirements: [] }
      lista.push(novo); porPol.set(pol, novo)
      if (!porNome.has(nk)) porNome.set(nk, novo)
      return novo
    }
    const achado = porNome.get(nk)
    if (achado) return achado
    const novo: Registro = { policy_number: null, client_name: nome, requirements: [] }
    lista.push(novo); porNome.set(nk, novo)
    return novo
  }

  // 1) Em vigor — a verdade sobre o que está de pé
  for (const r of d.inforce_rows || []) {
    const p = pegar(normPol(r.pol), titulo(String(r.owner || '')))
    p.product = p.product || r.type
    p.issued_at = p.issued_at || dataUS(r.issued)
    p.effective_date = p.effective_date || dataUS(r.issued)
    p.status = statusPortal(r.st) || p.status || 'issued'
  }

  // 2) New business — prêmio, envio e entrega
  for (const r of d.nb_rows || []) {
    const p = pegar(normPol(r.pol), String(r.name || ''))
    p.product = p.product || r.prod
    p.premium_cents = p.premium_cents || centavos(r.mp)
    // sem prêmio modal? o anualizado ÷ 12 vale mais que nada
    if (!p.premium_cents) { const a = centavos(r.aap); if (a) p.premium_cents = Math.round(a / 12) }
    p.submitted_at = p.submitted_at || dataUS(r.sub)
    p.issued_at = p.issued_at || dataUS(r.sent)
    if (!p.status) p.status = statusPortal(r.st) || 'submitted'
    if (/eDelivery with Client/i.test(r.deliv || '') && !p.requirements.includes('eDelivery')) p.requirements.push('eDelivery')
    if (/eDelivery Completed|Locked/i.test(r.deliv || '')) p._edeliveryOk = true
    p._fonteReq = true   // esta apólice está no new business → o portal sabe das pendências dela
  }

  // 3) Requisitos em aberto — "[07/14/2026]LSW Policy Receipt[07/28/2026]Amendment"
  for (const [pol, txt] of Object.entries(d.reqs || {})) {
    const p = porPol.get(normPol(pol) || '')
    if (!p) continue
    p._fonteReq = true
    for (const m of String(txt).matchAll(/\[(\d{2}\/\d{2}\/\d{4})\]\s*([^[]+)/g)) {
      const nome = m[2].trim().replace(/^LSW\s+/, '')
      if (nome && !p.requirements.includes(nome)) p.requirements.push(nome)
    }
  }

  // 4) Avisos de lapse — dinheiro na mesa com prazo
  for (const [pol, v] of Object.entries((d.pending_lapse || {}) as Record<string, any>)) {
    const p = porPol.get(normPol(pol) || '')
    if (!p) continue
    p.amount_due_cents = centavos(v.amount_due)
    p.due_date = dataUS(v.lapse_date)
    if (v.phone) p.client_phone = String(v.phone).replace(/^\)?/, '').trim()
    if (v.email) p.client_email = v.email
    if (p.status === 'active') p.status = 'at_risk'
  }

  // 4b) Risco de estorno (cartão "Company at Risk" do relatório NB) — a comissão
  // volta se a apólice cair. É urgência: vira at_risk, a menos que já encerrada.
  for (const pol of (d.estorno || []) as string[]) {
    const p = porPol.get(normPol(pol) || '')
    if (!p) continue
    if (!['lapsed', 'cancelled', 'declined'].includes(p.status || '')) p.status = 'at_risk'
  }

  // 5) Limbo — enviada no iGo e o portal ainda não processou
  for (const r of d.limbo || []) {
    const nome = titulo(nomeDireito(String(r.name || '').replace(/\s*Duplicated Case\s*/i, ' ').trim()))
    if (!nome) continue
    const p = pegar(null, nome)
    p.product = p.product || r.product
    p.coverage_cents = p.coverage_cents || centavos(r.face)
    p.submitted_at = p.submitted_at || dataUS(r.modified)
    p._dias = r.days_waiting ?? null
    if (!p.policy_number) p._igo = true
    if (!p.status) p.status = 'submitted'
  }

  // 6) iGo completo — a ÚNICA fonte com valor de cobertura (o portal não mostra
  // face amount em inforce nem em NB). Casa por nome pra ENRIQUECER quem já existe;
  // aplicação "Started" que não existe em lugar nenhum entra como pendência DO
  // corretor ("terminar a aplicação") — o limbo só pega as completas não processadas.
  const igoPorNome = new Map<string, any[]>()
  for (const r of d.igo_rows || []) {
    const nome = titulo(nomeDireito(String(r.name || '').replace(/\s*Duplicated Case\s*/i, ' ').trim()))
    if (!nome) continue
    const nk = chaveNome(nome)
    if (!igoPorNome.has(nk)) igoPorNome.set(nk, [])
    igoPorNome.get(nk)!.push({ ...r, _nome: nome })
  }
  for (const [nk, rows] of igoPorNome) {
    const p = porNome.get(nk)
    if (p) {
      // enriquece só sem ambiguidade: 2 aplicações com faces diferentes = não chuta
      const faces = [...new Set(rows.map(x => centavos(x.face)).filter(Boolean))]
      if (!p.coverage_cents && faces.length === 1) p.coverage_cents = faces[0] as number
      if (!p.product) p.product = rows[0].product || null
      continue
    }
    const started = rows.filter(x => /started/i.test(String(x.status || '')))
    if (!started.length) continue
    const r0 = started[0]
    const novo = pegar(null, r0._nome)
    novo.product = novo.product || r0.product
    novo.coverage_cents = novo.coverage_cents || centavos(r0.face)
    novo.submitted_at = novo.submitted_at || dataUS(r0.modified)
    novo._igo = true
    if (!novo.status) novo.status = 'submitted'
    if (!novo.requirements.includes('Terminar a aplicação no iGo')) novo.requirements.push('Terminar a aplicação no iGo')
  }

  // 7) Underwriting — pendência que só aparece no Case Communication (ex.: pergunta
  // de replacement sem resposta). Vira requisito visível; o detalhe fica no portal.
  for (const [pol, v] of Object.entries((d.uw_cases || {}) as Record<string, any>)) {
    const p = porPol.get(normPol(pol) || '')
    if (!p) continue
    p._fonteReq = true
    if (Array.isArray(v?.comms) && v.comms.length) p._comms = v.comms
    // "Responder o Case Communication" só é pendência quando o caso está EM ANÁLISE
    // e a ÚLTIMA palavra é da National (bola com o time). Conversa encerrada ou
    // última mensagem nossa = sem pendência falsa (auditoria 17/08: 18 casos
    // resolvidos estavam carimbados de "responder").
    const ultima = (v?.comms || []).slice(-1)[0]
    const bolaComAGente = !ultima || /national life|nlg/i.test(String(ultima.quem || 'National Life'))
    if (p.status === 'in_review' && bolaComAGente) {
      const trk = v?.tracker ? ` ${v.tracker}` : ''
      const req = `Underwriting${trk} — responder o Case Communication no portal`
      if (!p.requirements.some(x => x.startsWith('Underwriting'))) p.requirements.push(req)
    }
  }

  return lista.filter(p => p.client_name)
}

/* ---------- sincronização ---------- */

export async function sincronizarNL(db: Db, buyerId: string): Promise<NLResultado> {
  const cfg = await conectorDe(db, buyerId)
  if (!cfg) return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: 'Conector National Life não configurado nesta conta.' }

  let feed: any
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/data${q(cfg, true)}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`portal respondeu ${r.status}`)
    feed = await r.json()
  } catch (e: any) {
    return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: `Não consegui falar com o portal: ${e?.message || e}` }
  }

  // O mesmo feed pode ser importado manualmente mais de uma vez. Só os fatos
  // literais registrados pelo robô entram como alerta quando a leitura é nova.
  const geradoEmMs = new Date(feed?.generated_at || 0).getTime()
  const ultimoSyncMs = new Date(cfg.last_sync || 0).getTime()
  const leituraNova = !cfg.last_sync || (Number.isFinite(geradoEmMs) && geradoEmMs > ultimoSyncMs)

  const doPortal = montarDoFeed(feed)
  if (!doPortal.length) {
    return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: 'O portal não devolveu nenhuma apólice.' }
  }

  await salvarSnapshot(db, buyerId, snapshotDoFeed(feed))

  const { data: atuais, error } = await db.from('policies').select('*').eq('buyer_id', buyerId)
  if (error) return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: error.message }

  const porPol = new Map<string, any>()
  const porNome = new Map<string, any>()
  for (const p of atuais || []) {
    const k = normPol(p.policy_number)
    if (k) porPol.set(k, p)
    const nk = chaveNome(p.client_name)
    if (nk && !porNome.has(nk)) porNome.set(nk, p)
  }

  let novas = 0, atualizadas = 0, semMudanca = 0
  const mudancas: PolicyChangeAlert[] = []
  const primeiraImportacao = (atuais || []).length === 0
  const inserir: any[] = []

  for (const r of doPortal) {
    const atual = (r.policy_number && porPol.get(r.policy_number))
      || (!r.policy_number ? porNome.get(chaveNome(r.client_name)) : null)

    if (!atual) {
      inserir.push({
        buyer_id: buyerId, client_name: r.client_name, client_phone: r.client_phone || null,
        client_email: r.client_email || null, policy_number: r.policy_number, carrier: 'National Life',
        product: r.product || null, coverage_cents: r.coverage_cents || null,
        premium_cents: r.premium_cents || null, premium_mode: 'monthly',
        status: r.status || 'submitted', submitted_at: r.submitted_at || null,
        issued_at: r.issued_at || null, effective_date: r.effective_date || null,
        requirements: [...new Set(r.requirements)], amount_due_cents: r.amount_due_cents || null,
        due_date: r.due_date || null,
        notes: r._dias != null ? `iGo: enviada e ainda não processada — ${r._dias} dia(s) de espera.` : null,
        case_comm: r._comms || null,
      })
      continue
    }

    // fatos da seguradora sobrescrevem; o que o corretor escreveu, nunca.
    const mud: Record<string, any> = {}
    const reqNovos = [...new Set(r.requirements)]
    const reqAtuais = (atual.requirements || []) as string[]

    // Caso já encerrado (caducou, cancelou, não fechou) NÃO reabre por causa de uma
    // aplicação esquecida no iGo — o portal é quem ressuscita, não o eApp.
    const encerrado = ['lapsed', 'cancelled', 'declined'].includes(atual.status)
    const naoReabre = encerrado && r._igo
    if (r.status && r.status !== atual.status && !naoReabre) mud.status = r.status
    // Só troca as pendências quando o portal FALOU dessa apólice nesta leitura.
    // Silêncio do portal não é "resolvido" — apagar pendência real perderia comissão.
    // A lista de requisitos do portal não enxerga o eDelivery (isso vive na coluna de
    // entrega). Só tiramos "eDelivery" quando o portal confirma que foi assinado.
    if (!r._edeliveryOk && reqAtuais.includes('eDelivery') && !reqNovos.includes('eDelivery')) reqNovos.push('eDelivery')
    // Pendência MANUAL do corretor (prefixo ✋) sobrevive à sincronização — o portal
    // não sabe dela (ex.: pagamento devolvido avisado só por e-mail — caso Silvia 17/08).
    for (const manual of reqAtuais.filter(x => x.startsWith('✋'))) {
      if (!reqNovos.includes(manual)) reqNovos.push(manual)
    }
    const podeTrocarReq = r._fonteReq || reqNovos.length > 0
    if (podeTrocarReq && JSON.stringify(reqNovos.slice().sort()) !== JSON.stringify(reqAtuais.slice().sort())) mud.requirements = reqNovos
    // Em caso encerrado, a dívida que ficou é histórico — não apaga.
    if (!encerrado || r.amount_due_cents != null) {
      if ((r.amount_due_cents ?? null) !== (atual.amount_due_cents ?? null)) mud.amount_due_cents = r.amount_due_cents ?? null
      if ((r.due_date ?? null) !== (atual.due_date ?? null)) mud.due_date = r.due_date ?? null
    }
    if (r._comms && JSON.stringify(r._comms) !== JSON.stringify(atual.case_comm || null)) mud.case_comm = r._comms
    if (r.policy_number && !atual.policy_number) mud.policy_number = r.policy_number
    for (const c of ['product', 'premium_cents', 'coverage_cents', 'submitted_at', 'issued_at', 'effective_date'] as const) {
      if (atual[c] == null && (r as any)[c] != null) mud[c] = (r as any)[c]
    }

    if (!Object.keys(mud).length) { semMudanca++; continue }
    // mudou de estado → a ação anterior não vale mais
    if (mud.status || mud.requirements) mud.done_at = null
    mud.updated_at = new Date().toISOString()
    let { error: upErr } = await db.from('policies').update(mud).eq('id', atual.id).eq('buyer_id', buyerId)
    if (upErr && /case_comm/i.test(upErr.message) && 'case_comm' in mud) {
      delete mud.case_comm   // migration 040 ainda não rodou — segue sem o histórico
      if (Object.keys(mud).filter(key => key !== 'updated_at').length) {
        ;({ error: upErr } = await db.from('policies').update(mud).eq('id', atual.id).eq('buyer_id', buyerId))
      } else {
        semMudanca++
        continue
      }
    }
    if (!upErr) {
      atualizadas++
      if (mud.status) mudancas.push(novoAlerta({
        kind: 'status_changed', policy_id: atual.id, policy_number: r.policy_number || atual.policy_number,
        client_name: r.client_name || atual.client_name, from_status: atual.status, to_status: mud.status,
        action: reqNovos[0] ? orientarPendencia(reqNovos[0]).action : null,
      }))
      if (mud.requirements) {
        const antigos = new Set(reqAtuais)
        const novos = new Set(reqNovos)
        for (const requirement of reqNovos.filter(item => !antigos.has(item))) mudancas.push(novoAlerta({
          kind: 'requirement_added', policy_id: atual.id, policy_number: r.policy_number || atual.policy_number,
          client_name: r.client_name || atual.client_name, requirement,
          action: orientarPendencia(requirement).action,
        }))
        for (const requirement of reqAtuais.filter(item => !novos.has(item))) mudancas.push(novoAlerta({
          kind: 'requirement_removed', policy_id: atual.id, policy_number: r.policy_number || atual.policy_number,
          client_name: r.client_name || atual.client_name, requirement,
          action: null,
        }))
      }
    }
  }

  for (let i = 0; i < inserir.length; i += 50) {
    let lote = inserir.slice(i, i + 50)
    let { data, error: insErr } = await db.from('policies').insert(lote).select('id')
    if (insErr && /case_comm/i.test(insErr.message)) {
      lote = lote.map(({ case_comm: _caseComm, ...resto }: any) => resto)   // sem migration 040
      ;({ data, error: insErr } = await db.from('policies').insert(lote).select('id'))
    }
    if (!insErr) {
      novas += (data || []).length
      if (!primeiraImportacao) lote.forEach((item, index) => {
        const policyId = data?.[index]?.id || null
        mudancas.push(novoAlerta({
          kind: 'policy_added', policy_id: policyId, policy_number: item.policy_number,
          client_name: item.client_name, to_status: item.status || 'submitted',
          action: item.requirements?.[0] ? orientarPendencia(item.requirements[0]).action : null,
        }))
        for (const requirement of item.requirements || []) mudancas.push(novoAlerta({
          kind: 'requirement_added', policy_id: policyId, policy_number: item.policy_number,
          client_name: item.client_name, requirement, action: orientarPendencia(requirement).action,
        }))
      })
    }
  }

  // O status interno é propositalmente enxuto (enviada, emitida, ativa etc.).
  // Quando a National Life muda um status mais específico sem trocar esse grupo
  // interno, preservamos e avisamos o texto literal do portal também.
  if (leituraNova && Array.isArray(feed?.changes)) {
    for (const raw of feed.changes) {
      if (!['nb', 'inforce'].includes(String(raw?.kind || '').toLowerCase())) continue
      const policyNumber = normPol(raw?.pol)
      const text = String(raw?.change || '').trim()
      if (!policyNumber || !text || /^nova\b/i.test(text)) continue
      if (mudancas.some(change => change.kind === 'status_changed' && normPol(change.policy_number) === policyNumber)) continue

      const arrow = text.split(/\s*(?:→|->)\s*/, 2)
      if (arrow.length !== 2 && !/saiu da lista|removed from/i.test(text)) continue
      const portalPolicy = doPortal.find(item => item.policy_number === policyNumber)
      const current = porPol.get(policyNumber)
      mudancas.push(novoAlerta({
        kind: 'status_changed',
        policy_id: current?.id || null,
        policy_number: policyNumber,
        client_name: portalPolicy?.client_name || current?.client_name || policyNumber,
        from_status: current?.status || null,
        to_status: portalPolicy?.status || current?.status || null,
        from_value: arrow.length === 2 ? arrow[0] : null,
        to_value: arrow.length === 2 ? arrow[1] : text,
        action: portalPolicy?.requirements?.[0] ? orientarPendencia(portalPolicy.requirements[0]).action : null,
      }))
    }
  }

  let avisosEnviados = false
  if (mudancas.length) {
    try { await salvarAlertasApolices(db, buyerId, mudancas) } catch (e) { console.error('[NL sync] histórico de alertas falhou:', e) }
    // Marca a leitura antes dos canais externos: se WhatsApp/e-mail demorarem ou
    // falharem, o cron não reprocessa o mesmo feed e não duplica os avisos.
    await marcarSync(db, buyerId)
    try {
      const { notifyPolicyChanges } = await import('./notifications')
      const delivered = await notifyPolicyChanges(buyerId, mudancas)
      avisosEnviados = delivered.push > 0 || delivered.whatsapp || delivered.email
    } catch (e) {
      console.error('[NL sync] envio de alertas falhou:', e)
    }
  } else {
    await marcarSync(db, buyerId)
  }
  return {
    ok: true, novas, atualizadas, semMudanca,
    geradoEm: feed.generated_at || null,
    portalAtualizadoEm: feed.portal_last_updated || null,
    mudancas,
    avisosEnviados,
  }
}

export interface NLImportacaoAutomatica {
  verificados: number
  importados: number
  mudancas: number
  erros: { buyerId: string; erro: string }[]
}

/**
 * Importa automaticamente toda varredura nova concluída pelo robô. O cron chama
 * isto a cada minuto; `last_sync` garante que cada feed seja processado uma vez.
 */
export async function importarPortaisPendentes(db: Db = createAdminClient()): Promise<NLImportacaoAutomatica> {
  const summary: NLImportacaoAutomatica = { verificados: 0, importados: 0, mudancas: 0, erros: [] }
  const { data, error } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
  if (error) {
    summary.erros.push({ buyerId: 'settings', erro: error.message })
    return summary
  }
  const configs = ((data?.value as Record<string, NLConfig>) || {})

  // Sequencial de propósito: sincronizarNL atualiza mapas JSON compartilhados em
  // settings; duas contas gravando ao mesmo tempo poderiam sobrescrever a outra.
  for (const [buyerId, cfg] of Object.entries(configs)) {
    if (!cfg?.url || !cfg?.key) continue
    summary.verificados++
    try {
      const status = await statusVarredura(cfg)
      if (!status || status.running || status.awaiting_mfa || !status.last_run) continue
      const lastRun = new Date(status.last_run).getTime()
      const lastSync = new Date(cfg.last_sync || 0).getTime()
      if (!Number.isFinite(lastRun) || lastRun <= lastSync) continue

      const result = await sincronizarNL(db, buyerId)
      if (!result.ok) {
        summary.erros.push({ buyerId, erro: result.erro || 'Falha desconhecida' })
        continue
      }
      summary.importados++
      summary.mudancas += result.mudancas?.length || 0
    } catch (reason) {
      summary.erros.push({ buyerId, erro: reason instanceof Error ? reason.message : String(reason) })
    }
  }
  return summary
}
