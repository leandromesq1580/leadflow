/**
 * Recrutamento de agentes recém-licenciados: idioma provável, validação de campanha, e-mail (en/pt/es) e envio.
 * Separado das campanhas de leads (email-campaigns.ts): aqui o destinatário é um agente (recruit_agents), não um lead.
 */
import { CAMPAIGN_UUID, CampaignConfiguration, CampaignDb, CampaignProvider, campaignRpc, CAMPAIGN_URL } from './email-campaigns'

export type RecruitLang = 'en' | 'pt' | 'es'
export const RECRUIT_LANGS: RecruitLang[] = ['en', 'pt', 'es']
export const RECRUIT_STATUSES = ['new', 'contacted', 'replied', 'interested', 'joined', 'declined'] as const
export type RecruitStatus = (typeof RECRUIT_STATUSES)[number]
export const RECRUIT_MODULE_TAG = 'admin_recruit_campaigns'

// ---------- idioma provável (palpite pelo sobrenome; o admin pode corrigir na tela) ----------
const PT = new Set(['silva', 'santos', 'oliveira', 'pereira', 'souza', 'sousa', 'ferreira', 'rodrigues', 'almeida', 'carvalho', 'ribeiro',
  'araujo', 'barbosa', 'cardoso', 'cavalcante', 'nascimento', 'teixeira', 'moreira', 'machado', 'mendes', 'freitas', 'vieira', 'fernandes',
  'lopes', 'gomes', 'costa', 'lima', 'alves', 'nunes', 'batista', 'correia', 'azevedo', 'xavier', 'tavares', 'goncalves', 'martins',
  'pinheiro', 'andrade', 'barros', 'dias', 'coelho', 'duarte', 'figueiredo', 'albuquerque', 'siqueira', 'bezerra', 'rezende', 'medeiros'])
const ES = new Set(['garcia', 'rodriguez', 'martinez', 'lopez', 'gonzalez', 'hernandez', 'perez', 'sanchez', 'ramirez', 'torres', 'flores',
  'rivera', 'gomez', 'diaz', 'cruz', 'morales', 'reyes', 'gutierrez', 'ortiz', 'jimenez', 'castillo', 'vargas', 'romero', 'herrera', 'medina',
  'aguilar', 'mendoza', 'ruiz', 'alvarez', 'castro', 'vasquez', 'ramos', 'guzman', 'mejia', 'fernandez', 'moreno', 'munoz', 'rojas', 'ortega',
  'delgado', 'soto', 'contreras', 'suarez', 'salazar', 'valdez', 'vega', 'cortez', 'rios', 'estrada', 'nunez', 'padilla', 'cabrera', 'acosta',
  'pena', 'navarro', 'molina', 'santiago', 'guerrero', 'cardenas', 'figueroa', 'maldonado', 'velasquez', 'campos', 'ibarra', 'rosario', 'peralta'])

export function guessLanguage(name: string): RecruitLang {
  const raw = (name || '').toLowerCase()
  if (/[ãõç]/.test(raw)) return 'pt'
  const tokens = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(t => t.length > 2)
  const pt = tokens.some(t => PT.has(t)), es = tokens.some(t => ES.has(t))
  if (pt && es) return 'en' // sinais contraditórios (ex.: um sobrenome de cada língua): na dúvida, inglês
  if (pt) return 'pt'
  if (es) return 'es'
  if (tokens.length > 1 && /^[a-z]{4,}ez$/.test(tokens[tokens.length - 1])) return 'es'
  return 'en'
}

// ---------- validação ----------
export type RecruitFilters = { languages?: RecruitLang[]; states?: string[]; statuses?: RecruitStatus[] }
export type RecruitDraft = {
  name: string; subject_en: string; body_en: string; subject_pt: string; body_pt: string; subject_es: string; body_es: string
  filters: RecruitFilters; daily_limit: number
}

export function validateRecruitFilters(input: unknown): { ok: true; value: RecruitFilters } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: {} }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Filtros inválidos.' }
  const f = input as Record<string, unknown>
  const out: RecruitFilters = {}
  const list = (k: string) => (Array.isArray(f[k]) ? (f[k] as unknown[]) : f[k] === undefined ? [] : null)
  const langs = list('languages'), sts = list('states'), stat = list('statuses')
  if (!langs || !sts || !stat) return { ok: false, error: 'Filtros inválidos.' }
  if (langs.length) {
    if (!langs.every(l => RECRUIT_LANGS.includes(l as RecruitLang))) return { ok: false, error: 'Idioma inválido.' }
    out.languages = [...new Set(langs as RecruitLang[])]
  }
  if (sts.length) {
    if (sts.length > 60 || !sts.every(s => typeof s === 'string' && /^[A-Z]{2}$/.test(s))) return { ok: false, error: 'Estado inválido.' }
    out.states = [...new Set(sts as string[])]
  }
  if (stat.length) {
    if (!stat.every(s => RECRUIT_STATUSES.includes(s as RecruitStatus))) return { ok: false, error: 'Status inválido.' }
    out.statuses = [...new Set(stat as RecruitStatus[])]
  }
  return { ok: true, value: out }
}

export function validateRecruitCampaign(input: unknown): { ok: true; value: RecruitDraft } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Campanha inválida.' }
  const c = input as Record<string, unknown>
  const str = (k: string, max: number) => (typeof c[k] === 'string' ? (c[k] as string).trim() : '').slice(0, max + 1)
  const name = str('name', 100)
  if (!name || name.length > 100) return { ok: false, error: 'Dê um nome à campanha (até 100 letras).' }
  const labels: Record<RecruitLang, string> = { en: 'inglês', pt: 'português', es: 'espanhol' }
  const t: Record<string, string> = {}
  for (const l of RECRUIT_LANGS) {
    const s = str('subject_' + l, 160), b = str('body_' + l, 20000)
    if (!s || s.length > 160) return { ok: false, error: `Assunto em ${labels[l]} é obrigatório (até 160 letras).` }
    if (!b || b.length > 20000) return { ok: false, error: `Texto em ${labels[l]} é obrigatório.` }
    t['subject_' + l] = s; t['body_' + l] = b
  }
  const f = validateRecruitFilters(c.filters)
  if (!f.ok) return f
  const daily = c.daily_limit === undefined ? 200 : Number(c.daily_limit)
  if (!Number.isInteger(daily) || daily < 1 || daily > 1000) return { ok: false, error: 'Limite por dia deve ser de 1 a 1.000.' }
  return { ok: true, value: { name, ...(t as Omit<RecruitDraft, 'name' | 'filters' | 'daily_limit'>), filters: f.value, daily_limit: daily } }
}

/** Trechos "[[PREENCHER…]]" do modelo precisam ser trocados antes de qualquer envio. */
export function hasPlaceholder(d: Pick<RecruitDraft, 'subject_en' | 'body_en' | 'subject_pt' | 'body_pt' | 'subject_es' | 'body_es'>): boolean {
  return [d.subject_en, d.body_en, d.subject_pt, d.body_pt, d.subject_es, d.body_es].some(x => x.includes('[['))
}

// ---------- e-mail ----------
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const firstName = (name: string) => {
  const t = (name || '').replace(/[\r\n]/g, ' ').trim().split(/\s+/)[0] || ''
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''
}
const LABELS: Record<RecruitLang, { unsub: string; why: string; greet: string }> = {
  en: { unsub: 'Unsubscribe', why: 'You received this because you recently got your life insurance license in the United States (public record).', greet: 'Hello' },
  pt: { unsub: 'Cancelar recebimento', why: 'Você recebeu este e-mail porque obteve recentemente sua licença de seguro de vida nos EUA (registro público).', greet: 'Olá' },
  es: { unsub: 'Cancelar suscripción', why: 'Recibes este correo porque obtuviste recientemente tu licencia de seguro de vida en EE. UU. (registro público).', greet: 'Hola' },
}

/** Texto simples → HTML seguro: escapa tudo, parágrafos por linha em branco, só links https:// viram link. */
export function recruitBodyToHtml(body: string): string {
  return body.trim().split(/\n{2,}/).map(p => {
    const html = esc(p).replace(/https:\/\/[^\s<]+/g, u => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br/>')
    return `<p style="margin:0 0 14px">${html}</p>`
  }).join('')
}

/** O texto da campanha é HTML quando contém tags comuns de e-mail; senão é texto simples. */
export function isHtmlBody(body: string): boolean {
  return /<\/?(p|div|a|table|tbody|tr|td|th|br|h[1-6]|ul|ol|li|strong|b|em|i|u|span|img|center|hr|font)\b/i.test(body)
}

/** HTML escrito pelo admin: tira o que executa código ou puxa conteúdo de fora (script, iframe, form, onclick, javascript:). Estilo inline continua. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form|input|textarea|select|link|meta|base|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(script|iframe|object|embed|form|input|textarea|select|link|meta|base|svg|math)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction|xlink:href)\s*=\s*("\s*(javascript|vbscript|data):[^"]*"|'\s*(javascript|vbscript|data):[^']*')/gi, ' $1="#"')
    .replace(/expression\s*\(|url\s*\(\s*['"]?\s*javascript:/gi, '')
}

/** Versão em texto puro do HTML (parte "text/plain" do e-mail). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => { const label = t.replace(/<[^>]+>/g, '').trim(); return label && label !== href ? `${label} (${href})` : href })
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/li|hr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

type SendRow = { name: string; language: RecruitLang; unsubscribe_token: string; campaign: Pick<RecruitDraft, 'subject_en' | 'body_en' | 'subject_pt' | 'body_pt' | 'subject_es' | 'body_es'> }
export function renderRecruitEmail(row: SendRow, config: Pick<CampaignConfiguration, 'postal'>) {
  if (!CAMPAIGN_UUID.test(row.unsubscribe_token) || !RECRUIT_LANGS.includes(row.language)) throw new Error('invalid_recipient')
  const l = row.language, lab = LABELS[l]
  const nome = firstName(row.name) || lab.greet
  const fill = (s: string, safe = false) => s.replace(/{{\s*nome\s*}}/gi, () => (safe ? esc(nome) : nome))
  const subject = fill(row.campaign[('subject_' + l) as 'subject_en']).replace(/[\r\n]/g, ' ')
  const raw = row.campaign[('body_' + l) as 'body_en']
  const unsubscribe = `${CAMPAIGN_URL}/api/recruit/unsubscribe/${row.unsubscribe_token}`
  const html = isHtmlBody(raw)
  const bodyText = html ? htmlToText(fill(sanitizeEmailHtml(raw))) : fill(raw).trim()
  const bodyHtml = html ? `<div>${fill(sanitizeEmailHtml(raw), true)}</div>` : recruitBodyToHtml(fill(raw))
  return {
    subject,
    text: `${bodyText}\n\n--\nLead4Pro · ${config.postal}\n${lab.why}\n${lab.unsub}: ${unsubscribe}`,
    html: `<div style="font:16px/1.6 Arial,sans-serif;color:#0f172a">${bodyHtml}<hr style="border:0;border-top:1px solid #e2e8f0;margin:24px auto 16px;max-width:560px"/><p style="font-size:12px;line-height:1.5;color:#475569;max-width:560px;margin:0 auto">Lead4Pro · ${esc(config.postal)}<br/>${esc(lab.why)}<br/><a href="${unsubscribe}">${lab.unsub}</a></p></div>`,
    headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}

// ---------- envio (chamado a cada minuto pelo cron) ----------
type ClaimedSend = SendRow & { id: string; lease: string; email: string }
const provenRejections = new Set(['validation_error', 'missing_required_field', 'invalid_from_address', 'invalid_parameter', 'restricted_api_key', 'invalid_api_key', 'not_found', 'rate_limit_exceeded', 'daily_quota_exceeded'])

export async function dispatchRecruit(db: CampaignDb, provider: CampaignProvider, config: CampaignConfiguration) {
  const deadline = Date.now() + 45000
  const result = { accepted: 0, refused: 0, unknown: 0, skipped: 0, blocked: !config.ready }
  if (!config.ready) return result
  if (!(await provider.verifyDomain(config.domain))) return { ...result, blocked: true }
  for (let i = 0; i < 10 && Date.now() < deadline - 12000; i++) {
    const row = await campaignRpc<ClaimedSend | null>(db, 'rc_claim')
    if (!row) break
    let copy: ReturnType<typeof renderRecruitEmail>
    try { copy = renderRecruitEmail(row, config) } catch { result.skipped++; continue }
    if (hasPlaceholder(row.campaign)) { result.skipped++; continue } // nunca envia modelo não preenchido
    if (!(await campaignRpc(db, 'rc_authorize', { p_id: row.id, p_lease: row.lease }))) { result.skipped++; continue }
    let state: 'accepted' | 'refused' | 'unknown' = 'unknown', providerId: string | null = null
    try {
      const r = await provider.send({ from: config.from, to: [row.email], ...copy,
        tags: [{ name: 'module', value: RECRUIT_MODULE_TAG }, { name: 'recipient', value: row.id }] }, { idempotencyKey: 'l4p-recruit-' + row.id })
      if (r.data?.id && !r.error) { state = 'accepted'; providerId = r.data.id }
      else if (r.error?.name && provenRejections.has(r.error.name)) state = 'refused'
    } catch { /* sem prova de rejeição: quarentena, nunca reenvia sozinho */ }
    await campaignRpc(db, 'rc_finish', { p_id: row.id, p_lease: row.lease, p_state: state, p_provider: providerId, p_reason: state === 'accepted' ? null : state === 'unknown' ? 'provider_result_uncertain' : 'provider_rejected' })
    result[state]++
    if (state !== 'accepted') break
  }
  return result
}

// ---------- modelo inicial (texto aprovado pelo dono em 02/11, agora em HTML estilizado) ----------
// Assunto sem "Re:": fingir resposta a uma conversa que não existiu é assunto enganoso (CAN-SPAM).
const PAGE = 'https://lead4producers.com/equipe'
function styledBody(o: { hi: string; intro: string; items: string[]; cta: string; url: string; sign: string }) {
  const li = o.items.map(t => `<tr><td style="padding:6px 0;font-size:16px;color:#0f172a"><span style="color:#6366f1;font-weight:bold">✔</span>&nbsp; ${t}</td></tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif">
<tr><td style="background:#0b1020;color:#ffffff;padding:18px 24px;font-size:22px;font-weight:bold;border-radius:12px 12px 0 0">Lead<span style="color:#818cf8">4Pro</span></td></tr>
<tr><td style="background:#f8fafc;padding:26px 24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a">${o.hi}</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#334155">${o.intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${li}</table>
<p style="margin:0 0 22px"><a href="${o.url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:10px">${o.cta}</a></p>
<p style="margin:0;font-size:15px;color:#334155">${o.sign}</p>
</td></tr></table>`
}
export const RECRUIT_TEMPLATE: Pick<RecruitDraft, 'subject_en' | 'body_en' | 'subject_pt' | 'body_pt' | 'subject_es' | 'body_es'> = {
  subject_en: 'Congratulations on your new Life Insurance license',
  body_en: styledBody({ hi: 'Congratulations, {{nome}}!', intro: 'All of us at <b>WDT/Lead4Pro</b> are very happy about your achievement, and we would like to introduce you to the benefits and a unique opportunity to work with an agency that offers:',
    items: ['Commission starting at <b>65%</b>', 'Our own <b>CRM</b>', '<b>Unique leads</b> that are not shared with anyone else'], cta: 'Click to learn more →', url: PAGE + '/en', sign: 'WDT/Lead4Pro Team' }),
  subject_pt: 'Parabéns pela sua nova licença de Seguro de Vida',
  body_pt: styledBody({ hi: 'Parabéns, {{nome}}!', intro: 'Nós da <b>WDT/Lead4Pro</b> estamos muito felizes com a sua conquista e gostaríamos de lhe apresentar os benefícios e a oportunidade única de trabalhar com uma agência que oferece:',
    items: ['Comissões a partir de <b>65%</b>', '<b>CRM</b> próprio', '<b>Leads únicos</b>, que não são compartilhados com mais ninguém'], cta: 'Clique para saber mais →', url: PAGE, sign: 'Equipe WDT/Lead4Pro' }),
  subject_es: 'Felicidades por tu nueva licencia de Seguro de Vida',
  body_es: styledBody({ hi: '¡Felicidades, {{nome}}!', intro: 'Todos en <b>WDT/Lead4Pro</b> estamos muy felices por tu logro y queremos presentarte los beneficios y la oportunidad única de trabajar con una agencia que ofrece:',
    items: ['Comisiones desde el <b>65%</b>', '<b>CRM</b> propio', '<b>Leads únicos</b> que no se comparten con nadie más'], cta: 'Haz clic para saber más →', url: PAGE + '/es', sign: 'Equipo WDT/Lead4Pro' }),
}

// ---------- tela "Novos Agentes": junta a lista do DFS com o que já foi salvo no recrutamento ----------
export type SavedRecruit = { email: string; language: RecruitLang; status: RecruitStatus }
/** Idioma e status de cada agente do DFS. Quem ainda não foi salvo vem com idioma provável e status null. */
export function withRecruitInfo<T extends { name: string; email: string }>(list: T[], saved: SavedRecruit[]) {
  const by = new Map(saved.map(r => [r.email.trim().toLowerCase(), r]))
  return list.map(a => {
    const r = by.get((a.email || '').trim().toLowerCase())
    return { ...a, language: (r?.language ?? guessLanguage(a.name)) as RecruitLang, status: (r?.status ?? null) as RecruitStatus | null }
  })
}
