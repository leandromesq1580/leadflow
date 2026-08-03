import { createAdminClient } from './supabase/admin'
import type { PolicyStatus } from './insurance-policies'

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

export interface NLConfig { url: string; key: string; agent?: string; last_sync?: string }

export interface NLResultado {
  ok: boolean
  novas: number
  atualizadas: number
  semMudanca: number
  geradoEm?: string | null
  portalAtualizadoEm?: string | null
  erro?: string
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

function statusPortal(st?: string | null): PolicyStatus | null {
  const s = String(st || '')
  if (/lapsed/i.test(s)) return 'lapsed'
  if (/pending lapse/i.test(s)) return 'at_risk'
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

  return lista.filter(p => p.client_name)
}

/* ---------- sincronização ---------- */

export async function sincronizarNL(db: Db, buyerId: string): Promise<NLResultado> {
  const cfg = await conectorDe(db, buyerId)
  if (!cfg) return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: 'Conector National Life não configurado nesta conta.' }

  let feed: any
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/data?k=${encodeURIComponent(cfg.key)}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`portal respondeu ${r.status}`)
    feed = await r.json()
  } catch (e: any) {
    return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: `Não consegui falar com o portal: ${e?.message || e}` }
  }

  const doPortal = montarDoFeed(feed)
  if (!doPortal.length) {
    return { ok: false, novas: 0, atualizadas: 0, semMudanca: 0, erro: 'O portal não devolveu nenhuma apólice.' }
  }

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
    const podeTrocarReq = r._fonteReq || reqNovos.length > 0
    if (podeTrocarReq && JSON.stringify(reqNovos.slice().sort()) !== JSON.stringify(reqAtuais.slice().sort())) mud.requirements = reqNovos
    // Em caso encerrado, a dívida que ficou é histórico — não apaga.
    if (!encerrado || r.amount_due_cents != null) {
      if ((r.amount_due_cents ?? null) !== (atual.amount_due_cents ?? null)) mud.amount_due_cents = r.amount_due_cents ?? null
      if ((r.due_date ?? null) !== (atual.due_date ?? null)) mud.due_date = r.due_date ?? null
    }
    if (r.policy_number && !atual.policy_number) mud.policy_number = r.policy_number
    for (const c of ['product', 'premium_cents', 'coverage_cents', 'submitted_at', 'issued_at', 'effective_date'] as const) {
      if (atual[c] == null && (r as any)[c] != null) mud[c] = (r as any)[c]
    }

    if (!Object.keys(mud).length) { semMudanca++; continue }
    // mudou de estado → a ação anterior não vale mais
    if (mud.status || mud.requirements) mud.done_at = null
    mud.updated_at = new Date().toISOString()
    const { error: upErr } = await db.from('policies').update(mud).eq('id', atual.id).eq('buyer_id', buyerId)
    if (!upErr) atualizadas++
  }

  for (let i = 0; i < inserir.length; i += 50) {
    const { data, error: insErr } = await db.from('policies').insert(inserir.slice(i, i + 50)).select('id')
    if (!insErr) novas += (data || []).length
  }

  await marcarSync(db, buyerId)
  return {
    ok: true, novas, atualizadas, semMudanca,
    geradoEm: feed.generated_at || null,
    portalAtualizadoEm: feed.portal_last_updated || null,
  }
}
