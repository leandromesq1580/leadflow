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
  if (tokens.some(t => PT.has(t))) return 'pt'
  if (tokens.some(t => ES.has(t))) return 'es'
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

type SendRow = { name: string; language: RecruitLang; unsubscribe_token: string; campaign: Pick<RecruitDraft, 'subject_en' | 'body_en' | 'subject_pt' | 'body_pt' | 'subject_es' | 'body_es'> }
export function renderRecruitEmail(row: SendRow, config: Pick<CampaignConfiguration, 'postal'>) {
  if (!CAMPAIGN_UUID.test(row.unsubscribe_token) || !RECRUIT_LANGS.includes(row.language)) throw new Error('invalid_recipient')
  const l = row.language, lab = LABELS[l]
  const nome = firstName(row.name) || lab.greet
  const fill = (s: string) => s.replace(/{{\s*nome\s*}}/gi, () => nome)
  const subject = fill(row.campaign[('subject_' + l) as 'subject_en']).replace(/[\r\n]/g, ' ')
  const body = fill(row.campaign[('body_' + l) as 'body_en'])
  const unsubscribe = `${CAMPAIGN_URL}/api/recruit/unsubscribe/${row.unsubscribe_token}`
  return {
    subject,
    text: `${body.trim()}\n\n--\nLead4Pro · ${config.postal}\n${lab.why}\n${lab.unsub}: ${unsubscribe}`,
    html: `<div style="font:16px/1.6 Arial,sans-serif;color:#0f172a">${recruitBodyToHtml(body)}<hr/><p style="font-size:12px;color:#475569">Lead4Pro · ${esc(config.postal)}<br/>${esc(lab.why)}<br/><a href="${unsubscribe}">${lab.unsub}</a></p></div>`,
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

// ---------- modelo inicial (os números reais da oferta ficam para o admin preencher) ----------
export const RECRUIT_TEMPLATE: Pick<RecruitDraft, 'subject_en' | 'body_en' | 'subject_pt' | 'body_pt' | 'subject_es' | 'body_es'> = {
  subject_en: '{{nome}}, congrats on your new license — what\'s next?',
  body_en: `Hi {{nome}},\n\nCongratulations on getting your life insurance license. A license alone doesn't pay the bills — you need leads, carrier contracts and a system to follow up.\n\nAt Lead4Pro we give new agents:\n• Commission starting at 65%\n• Our own CRM, built for insurance agents\n• Leads: [[PREENCHER: quantidade de leads e custo, se houver]]\n\nSee all the benefits: https://lead4producers.com/equipe/en\n\nIf you'd like to talk for 10 minutes, just reply to this email with the best time and phone number.\n\nBest,\n[[PREENCHER: nome de quem assina]]`,
  subject_pt: '{{nome}}, parabéns pela licença — e agora?',
  body_pt: `Olá {{nome}},\n\nParabéns pela sua licença de seguro de vida. Só a licença não paga as contas: é preciso ter leads, contrato com seguradoras e um sistema para acompanhar os clientes.\n\nNa Lead4Pro oferecemos ao agente novo:\n• Comissão a partir de 65%\n• CRM próprio, feito para agentes de seguro\n• Leads: [[PREENCHER: quantidade de leads e custo, se houver]]\n\nVeja todos os benefícios: https://lead4producers.com/equipe\n\nSe quiser conversar 10 minutos, responda este e-mail com o melhor horário e telefone.\n\nAbraço,\n[[PREENCHER: nome de quem assina]]`,
  subject_es: '{{nome}}, felicidades por tu licencia — ¿y ahora qué?',
  body_es: `Hola {{nome}},\n\nFelicidades por tu licencia de seguro de vida. La licencia sola no paga las cuentas: necesitas leads, contratos con aseguradoras y un sistema para dar seguimiento.\n\nEn Lead4Pro ofrecemos al agente nuevo:\n• Comisión desde el 65%\n• CRM propio, hecho para agentes de seguros\n• Leads: [[PREENCHER: cantidad de leads y costo, si hay]]\n\nMira todos los beneficios: https://lead4producers.com/equipe/es\n\nSi quieres hablar 10 minutos, responde este correo con el mejor horario y teléfono.\n\nSaludos,\n[[PREENCHER: nombre de quien firma]]`,
}
