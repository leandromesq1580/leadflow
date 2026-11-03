import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recruitEnv, sanitizeEmailHtml, isHtmlBody, htmlToText, withRecruitInfo, guessLanguage, validateRecruitCampaign, validateRecruitFilters, hasPlaceholder, renderRecruitEmail, recruitBodyToHtml, dispatchRecruit, RECRUIT_TEMPLATE } from '../src/lib/recruit-agents'

const TOKEN = '11111111-2222-4333-8444-555555555555'
const CFG = { postal: '1 Main St, Miami FL 33101' }
const full = { name: 'Nov', subject_en: 'a', body_en: 'b', subject_pt: 'c', body_pt: 'd', subject_es: 'e', body_es: 'f', filters: {}, daily_limit: 200 }

test('idioma provável pelo sobrenome', () => {
  assert.equal(guessLanguage('KARIM ABDELHASSIB'), 'en')
  assert.equal(guessLanguage('MARIA DA SILVA'), 'pt')
  assert.equal(guessLanguage('JOÃO PEDRO'), 'pt')
  assert.equal(guessLanguage('CARLOS GARCIA'), 'es')
  assert.equal(guessLanguage('LUIS MARTÍNEZ'), 'es')
  assert.equal(guessLanguage('JOHN SMITH'), 'en')
  assert.equal(guessLanguage(''), 'en')
})
test('campanha exige texto e assunto nos 3 idiomas', () => {
  assert.equal(validateRecruitCampaign(full).ok, true)
  for (const k of ['subject_en', 'body_pt', 'subject_es']) assert.equal(validateRecruitCampaign({ ...full, [k]: ' ' }).ok, false, k)
  assert.equal(validateRecruitCampaign({ ...full, name: '' }).ok, false)
  assert.equal(validateRecruitCampaign({ ...full, daily_limit: 5000 }).ok, false)
  assert.equal(validateRecruitCampaign({ ...full, subject_en: 'x'.repeat(161) }).ok, false)
  assert.equal(validateRecruitCampaign({ ...full, filters: { languages: ['fr'] } }).ok, false)
  assert.equal(validateRecruitCampaign(null).ok, false)
})
test('filtros: idioma, UF e status válidos; resto é rejeitado', () => {
  assert.deepEqual(validateRecruitFilters({ languages: ['pt', 'pt'], states: ['FL'], statuses: ['new'] }), { ok: true, value: { languages: ['pt'], states: ['FL'], statuses: ['new'] } })
  assert.equal(validateRecruitFilters({ states: ['Florida'] }).ok, false)
  assert.equal(validateRecruitFilters({ statuses: ['x'] }).ok, false)
  assert.equal(validateRecruitFilters([]).ok, false)
  assert.deepEqual(validateRecruitFilters(undefined), { ok: true, value: {} })
})
test('modelo: sem trechos a preencher, 65%, link no idioma certo, sem "Re:" no assunto, {{nome}} presente', () => {
  assert.equal(hasPlaceholder(RECRUIT_TEMPLATE), false)
  assert.equal(hasPlaceholder({ ...RECRUIT_TEMPLATE, body_pt: 'falta [[PREENCHER]]' }), true)
  for (const l of ['en', 'pt', 'es'] as const) {
    const T = RECRUIT_TEMPLATE as Record<string, string>
    assert.match(T['body_' + l], /65%/)
    assert.match(T['body_' + l], /\{\{nome\}\}/)
    assert.match(T['body_' + l], /WDT\/Lead4Pro/)
    assert.doesNotMatch(T['subject_' + l], /^\s*(re|fw|fwd):/i)
    assert.ok(T['subject_' + l].length <= 160)
  }
  assert.match(RECRUIT_TEMPLATE.body_pt, /lead4producers\.com\/equipe(?!\/)/)
  assert.match(RECRUIT_TEMPLATE.body_en, /lead4producers\.com\/equipe\/en/)
  assert.match(RECRUIT_TEMPLATE.body_es, /lead4producers\.com\/equipe\/es/)
  assert.equal(validateRecruitCampaign({ name: 'x', ...RECRUIT_TEMPLATE, filters: {}, daily_limit: 200 }).ok, true)
})
test('e-mail: idioma, nome, descadastro, endereço e escape de HTML', () => {
  const c = { subject_en: 'Hi {{nome}}', body_en: 'EN 1 < 2 & https://a.com/p', subject_pt: 'Oi {{nome}}', body_pt: 'PT', subject_es: 'Hola {{nome}}', body_es: 'ES' }
  const pt = renderRecruitEmail({ name: 'MARIA SILVA', language: 'pt', unsubscribe_token: TOKEN, campaign: c }, CFG)
  assert.equal(pt.subject, 'Oi Maria')
  assert.match(pt.text, /Cancelar recebimento: https:\/\/lead4producers\.com\/api\/recruit\/unsubscribe\/11111111/)
  assert.match(pt.html, /1 Main St, Miami FL 33101/)
  assert.equal(pt.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  const es = renderRecruitEmail({ name: '', language: 'es', unsubscribe_token: TOKEN, campaign: c }, CFG)
  assert.equal(es.subject, 'Hola Hola') // sem nome → saudação do idioma
  const en = renderRecruitEmail({ name: 'Bob', language: 'en', unsubscribe_token: TOKEN, campaign: c }, CFG)
  assert.match(en.html, /1 &lt; 2 &amp;/)
  assert.match(en.html, /<a href="https:\/\/a\.com\/p">/)
  assert.match(en.text, /Unsubscribe:/)
  assert.throws(() => renderRecruitEmail({ name: 'x', language: 'en', unsubscribe_token: 'bad', campaign: c }, CFG))
  assert.throws(() => renderRecruitEmail({ name: 'x', language: 'fr' as 'en', unsubscribe_token: TOKEN, campaign: c }, CFG))
})
test('link com javascript: não vira link', () => {
  assert.doesNotMatch(recruitBodyToHtml('javascript:alert(1) http://x.com'), /<a /)
})

// ---- envio ----
function harness(rowOverrides: Record<string, unknown> = {}, sendResult: unknown = { data: { id: 'prov-1' }, error: null }) {
  const calls: [string, Record<string, unknown> | undefined][] = []
  const sent: unknown[] = []
  let claimed = false
  const row = { id: 'r1', lease: 'l1', email: 'a@x.com', name: 'Ana', language: 'es', unsubscribe_token: TOKEN, campaign: { ...full, subject_en: 's', body_en: 'b' }, ...rowOverrides }
  const db = { rpc: async (n: string, a?: Record<string, unknown>) => {
    calls.push([n, a])
    if (n === 'rc_claim') { if (claimed) return { data: null, error: null }; claimed = true; return { data: row, error: null } }
    if (n === 'rc_authorize') return { data: true, error: null }
    return { data: true, error: null }
  } }
  const provider = { verifyDomain: async () => true, trackingStatus: async () => ({}) as never,
    send: async (p: unknown) => { sent.push(p); if (sendResult instanceof Error) throw sendResult; return sendResult as never } }
  const config = { ready: true, domain: 'l.com', from: 'L <a@l.com>', postal: CFG.postal } as never
  return { calls, sent, db, provider, config }
}
test('envio feliz: autoriza antes de enviar, marca recruit e grava accepted', async () => {
  const h = harness()
  const r = await dispatchRecruit(h.db, h.provider as never, h.config)
  assert.equal(r.accepted, 1)
  assert.deepEqual(h.calls.map(c => c[0]), ['rc_claim', 'rc_authorize', 'rc_finish', 'rc_claim'])
  const s = h.sent[0] as { tags: { name: string; value: string }[]; to: string[] }
  assert.deepEqual(s.to, ['a@x.com'])
  assert.ok(s.tags.some(t => t.value === 'admin_recruit_campaigns'))
  assert.equal(h.calls[2][1]?.p_state, 'accepted')
})
test('texto com [[PREENCHER]] nunca sai', async () => {
  const h = harness({ campaign: { ...full, subject_en: 's', body_en: 'faltou [[PREENCHER]]' } })
  const r = await dispatchRecruit(h.db, h.provider as never, h.config)
  assert.equal(h.sent.length, 0); assert.equal(r.skipped, 1)
})
test('descadastrado no banco (authorize=false): nada é enviado', async () => {
  const h = harness(); const orig = h.db.rpc
  h.db.rpc = async (n, a) => n === 'rc_authorize' ? { data: false, error: null } : orig(n, a)
  const r = await dispatchRecruit(h.db, h.provider as never, h.config)
  assert.equal(h.sent.length, 0); assert.equal(r.skipped, 1)
})
test('falha sem prova de rejeição vira "unknown" e para o lote (nunca reenvia sozinho)', async () => {
  const h = harness({}, new Error('timeout'))
  const r = await dispatchRecruit(h.db, h.provider as never, h.config)
  assert.equal(r.unknown, 1); assert.equal(h.sent.length, 1)
  assert.equal(h.calls.find(c => c[0] === 'rc_finish')?.[1]?.p_state, 'unknown')
  assert.equal(h.calls.filter(c => c[0] === 'rc_claim').length, 1)
})
test('configuração não pronta: não consulta o banco', async () => {
  const h = harness(); (h.config as { ready: boolean }).ready = false
  const r = await dispatchRecruit(h.db, h.provider as never, h.config)
  assert.equal(r.blocked, true); assert.equal(h.calls.length, 0)
})

test('Novos Agentes: usa idioma/status salvos; quem não foi salvo ganha idioma provável e status null', () => {
  const out = withRecruitInfo(
    [{ name: 'MARIA SILVA', email: 'Maria@X.com ' }, { name: 'JOHN SMITH', email: 'john@x.com' }, { name: 'ANA', email: '' }],
    [{ email: 'maria@x.com', language: 'es', status: 'contacted' }])
  assert.deepEqual(out.map(a => [a.language, a.status]), [['es', 'contacted'], ['en', null], ['en', null]])
})

test('corpo em HTML: mantém estilo, tira script/onclick/javascript:, troca {{nome}} escapado, mantém rodapé e texto puro', () => {
  const evil = '<p style="color:red" onclick="x()">Oi {{nome}} <a href="javascript:alert(1)">a</a><script>alert(1)</script><iframe src="//e"></iframe> <a href="https://ok.com" style="color:blue">ok</a></p>'
  assert.equal(isHtmlBody(evil), true); assert.equal(isHtmlBody('texto simples'), false)
  const clean = sanitizeEmailHtml(evil)
  assert.doesNotMatch(clean, /script|iframe|onclick|javascript:/i)
  assert.match(clean, /style="color:red"/); assert.match(clean, /href="https:\/\/ok\.com"/)
  const c = { subject_en: 's', body_en: evil, subject_pt: 's', body_pt: evil, subject_es: 's', body_es: evil }
  const r = renderRecruitEmail({ name: 'A<i>B', language: 'pt', unsubscribe_token: TOKEN, campaign: c }, CFG)
  assert.doesNotMatch(r.html, /<script|onclick|javascript:/i)
  assert.match(r.html, /Cancelar recebimento/); assert.match(r.html, /1 Main St/)
  assert.match(r.text, /Oi A<i>B|Oi A/); assert.doesNotMatch(r.text, /<p|<a /)
  assert.match(htmlToText('<p>Oi</p><a href="https://x.com">clique</a>'), /Oi\s+clique \(https:\/\/x\.com\)/)
})
test('modelo em HTML estilizado: é HTML, sem script, com 65%, link do idioma e {{nome}}', () => {
  for (const l of ['en', 'pt', 'es'] as const) {
    const b = (RECRUIT_TEMPLATE as Record<string, string>)['body_' + l]
    assert.equal(isHtmlBody(b), true); assert.equal(sanitizeEmailHtml(b), b)
    assert.match(b, /65%/); assert.match(b, /\{\{nome\}\}/)
  }
})

test('idioma: sinais contraditórios (sobrenome PT + ES) caem em inglês; sinal único mantém', () => {
  assert.equal(guessLanguage('ANA SILVA GARCIA'), 'en')
  assert.equal(guessLanguage('ANA SILVA'), 'pt')
  assert.equal(guessLanguage('ANA GARCIA'), 'es')
  assert.equal(guessLanguage('JOHN SMITH'), 'en')
})

test('remetente do recrutamento: variável própria vence; sem ela, usa o das campanhas', () => {
  assert.equal(recruitEnv({ EMAIL_CAMPAIGNS_FROM_EMAIL: 'a@x.com', EMAIL_RECRUIT_FROM_EMAIL: ' b@y.com ' }).EMAIL_CAMPAIGNS_FROM_EMAIL, 'b@y.com')
  assert.equal(recruitEnv({ EMAIL_CAMPAIGNS_FROM_EMAIL: 'a@x.com' }).EMAIL_CAMPAIGNS_FROM_EMAIL, 'a@x.com')
  assert.equal(recruitEnv({ EMAIL_CAMPAIGNS_FROM_EMAIL: 'a@x.com', EMAIL_RECRUIT_FROM_EMAIL: '  ' }).EMAIL_CAMPAIGNS_FROM_EMAIL, 'a@x.com')
})
