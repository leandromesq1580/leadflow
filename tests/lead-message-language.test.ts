import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as locale from '../src/lib/lead-message-locale'
import * as templates from '../src/lib/lead-message-template'
import * as systemTemplates from '../src/lib/system-template-i18n'
import * as renderer from '../src/lib/template-render'

type Query = { table: string; calls: [string, ...any[]][] }
function database(resolve: (query: Query) => any) {
  const queries: Query[] = []
  return {
    queries,
    from(table: string) {
      const q: Query = { table, calls: [] }
      queries.push(q)
      const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
        ? (accept: any, reject: any) => Promise.resolve(resolve(q)).then(accept, reject)
        : (...args: any[]) => { q.calls.push([String(key), ...args]); return chain } })
      return chain
    },
  }
}
function load(path: string, dependencies: Record<string, any>) {
  const js = transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

test('lead language is authoritative, including known Spanish forms with legacy PT data', () => {
  assert.equal(locale.leadMessageLocale({ lead_language: 'es' }), 'es')
  assert.equal(locale.leadMessageLocale({ lead_language: 'pt' }), 'pt')
  assert.equal(locale.leadMessageLocale({ lead_language: 'en' }), 'en')
  assert.equal(locale.leadMessageLocale({ form_name: '1963007337624994', lead_language: 'pt' }), 'es')
  assert.equal(locale.leadMessageLocale({ form_name: '25952858404333766' }), 'pt')
  for (const lead of [{}, { lead_language: 'fr' }, { meta_lead_id: 'unknown', form_name: 'new-form' }]) {
    assert.equal(locale.leadMessageLocale(lead), null)
    assert.throws(() => locale.requireLeadMessageLocale(lead), /\[lead-language\]/)
  }
  assert.equal(locale.leadMessageLanguageLabel('es', 'pt'), 'Espanhol')
  assert.equal(locale.leadMessageLanguageLabel('pt', 'es'), 'Portugués')
  assert.equal(locale.leadMessageLanguageLabel('en', 'en'), 'English')
})

test('all system templates localize without requiring AI or database reads', async () => {
  const names = ['Primeiro contato', 'Follow-up 24h', 'Agendar reunião', 'Enviando proposta', 'Follow-up 3 dias', 'Obrigado fechamento', 'Email boas-vindas']
  const db = { from() { throw new Error('System copy must not require translation service') } } as any
  for (const name of names) {
    const input = { name, body: 'texto legado', subject: null, is_system: true }
    for (const language of ['pt', 'es', 'en'] as const) {
      assert.deepEqual(await templates.localizeLeadTemplate(db, input, { lead_language: language }), systemTemplates.localizeSystemTemplate(input, language))
    }
  }
})

test('custom translation preserves variables, numbers, links, subject; cache invalidates after an edit', async t => {
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'fixture-not-a-real-key'
  t.after(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey })
  const saved = new Map<string, any>()
  const db = database(q => {
    const write = q.calls.find(c => c[0] === 'upsert')?.[1]
    if (write) { saved.set(write.key, write.value); return { error: null } }
    const key = q.calls.find(c => c[0] === 'eq' && c[1] === 'key')?.[2]
    return { data: saved.has(key) ? { value: saved.get(key) } : null }
  })
  let requests = 0
  const source = { body: 'Oi {primeiro_nome}! Link https://example.invalid/cotacao em 30 minutos.', subject: 'Cotação para {nome}' }
  t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    const request = JSON.parse(options.body)
    assert.equal(request.response_format.type, 'json_object')
    assert.ok(!options.body.includes('Maria'), 'personal values must not be inserted before translation')
    const masked = JSON.parse(request.messages[1].content)
    assert.ok(!masked.body.includes('{primeiro_nome}'))
    assert.ok(!masked.body.includes('https://example.invalid'))
    requests++
    return Response.json({ choices: [{ message: { content: JSON.stringify({ locale: 'es', body: masked.body.replace('Oi ', '¡Hola ').replace('Link ', 'Enlace ').replace(' em ', ' en '), subject: masked.subject.replace('Cotação para', 'Cotización para') }) } }] })
  })
  const first = await templates.translateLeadCopy(db as any, source, 'es')
  assert.equal(requests, 1)
  assert.equal(renderer.renderTemplate(first.body, { name: 'Maria Fixture' }, {}, 'es'), '¡Hola Maria! Enlace https://example.invalid/cotacao en 30 minutos.')
  assert.deepEqual(await templates.translateLeadCopy(db as any, source, 'es'), first)
  assert.equal(requests, 1)
  await templates.translateLeadCopy(db as any, { ...source, body: source.body + ' Por favor.' }, 'es')
  assert.equal(requests, 2)
  assert.equal(templates.validTranslatedCopy({ ...first, body: first.body.replace('30', '40') }, source), false)
  assert.equal(templates.validTranslatedCopy({ ...first, body: first.body.replace('{primeiro_nome}', '{first_name}') }, source), false)
  assert.equal(templates.validTranslatedCopy({ ...first, subject: null }, source), false)
})

test('translation failures never return the original wrong-language text', async t => {
  const key = process.env.OPENAI_API_KEY
  t.after(() => { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key })
  const db = database(() => ({ data: null })) as any
  delete process.env.OPENAI_API_KEY
  await assert.rejects(templates.translateLeadCopy(db, { body: 'Oi {nome}', subject: null }, 'es'), /\[lead-language\]/)
  process.env.OPENAI_API_KEY = 'fixture-not-a-real-key'
  t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: '{"locale":"pt","body":"Oi {nome}","subject":null}' } }] }))
  await assert.rejects(templates.translateLeadCopy(db, { body: 'Oi {nome}', subject: null }, 'es'), /Tradução inválida/)
})

for (const engine of ['automation', 'sequence']) {
  for (const language of ['pt', 'es', 'en', null] as const) {
    for (const channel of ['whatsapp', 'email']) {
      test(`${engine} ${channel}: lead=${language} overrides producer locale`, async t => {
        const lead = { id: 'lead', name: 'Maria Fixture', phone: '+14075550100', email: 'maria@example.invalid', lead_language: language }
        const agent = { id: 'buyer', name: 'Agent Fixture', email: 'agent@example.invalid', is_active: true }
        const template = { id: 'b525b260-6b83-4a21-bcae-745064d019bf', name: 'Email boas-vindas', body: 'Oi {nome}', subject: null as string | null, type: channel, is_system: true }
        const auto = { id: 'auto', buyer_id: 'buyer', name: 'Fixture', trigger_type: 'stage_entered', trigger_config: { stage_id: 'stage' }, action_type: 'send_template', action_config: { template_id: template.id } }
        const enr = { id: 'enr', buyer_id: 'buyer', lead_id: 'lead', sequence_id: 'seq', current_step: 0, next_run_at: '2026-01-01T00:00:00Z' }
        const db = database(q => {
          if (q.table === 'automations') return { data: [auto] }
          if (q.table === 'pipelines') return { data: [{ id: 'pipe' }] }
          if (q.table === 'pipeline_leads') return { data: [{ id: 'pl', lead_id: 'lead' }] }
          if (q.table === 'automation_runs') return { data: q.calls.some(c => c[0] === 'insert') ? { id: 'run' } : null }
          if (q.table === 'sequence_enrollments') return { data: q.calls.some(c => c[0] === 'update') ? null : [enr] }
          if (q.table === 'sequence_steps') return { data: [{ step_type: 'send_template', template_id: template.id, step_order: 0 }] }
          if (q.table === 'templates') return { data: template }
          if (q.table === 'leads') return { data: lead }
          if (q.table === 'buyers') return { data: agent }
          if (q.table === 'follow_ups' || q.table === 'whatsapp_messages') return { data: null }
          throw new Error(`Unexpected query ${q.table}`)
        })
        const sends: any[] = []
        const oldKey = process.env.RESEND_API_KEY
        process.env.RESEND_API_KEY = 'fixture'
        t.after(() => { if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey })
        t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
          assert.equal(url, 'https://bridge.example.invalid/send')
          sends.push(JSON.parse(options.body))
          return Response.json({ id: 'wa-fixture' })
        })
        const dependencies = {
          '@/lib/supabase/admin': { createAdminClient: () => db },
          '@/lib/template-render': renderer,
          '@/lib/system-template-i18n': systemTemplates,
          '@/lib/lead-message-locale': locale,
          '@/lib/lead-message-template': templates,
          '@/lib/wa-bridge': { resolveSendBridge: async () => ({ url: 'https://bridge.example.invalid', key: 'fixture', phone: '14075550101' }) },
          '@/lib/send-guard': { checkSendRate: async () => ({ ok: true }) },
          '@/lib/buyer-locale': { localeDoBuyer: async () => { throw new Error('Customer send must never consult producer locale') } },
          resend: { Resend: class { emails = { send: async (message: any) => { sends.push(message); return { data: { id: 'email-fixture' } } } } } },
        }
        const app = load(`lib/${engine}-engine.ts`, dependencies)
        const outcome = engine === 'automation' ? await app.runAutomations(['buyer']) : await app.processSequences()
        assert.equal(outcome.failed, language ? 0 : 1)
        assert.equal(sends.length, language ? 1 : 0)
        if (!language) return
        const expected = systemTemplates.localizeSystemTemplate(template, language)
        const body = renderer.renderTemplate(expected.body, lead, agent, language)
        assert.equal(channel === 'whatsapp' ? sends[0].message : sends[0].html, channel === 'email' ? body.replace(/\n/g, '<br/>') : body)
        if (channel === 'email') assert.equal(sends[0].subject, expected.subject)
      })
    }
  }
}

test('automatic SMS uses the lead language now and rechecks messages queued before the fix', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-07T16:00:00Z') })
  for (const language of ['pt', 'es', 'en', null]) {
    for (const scheduled of [false, true]) {
      const lead = { id: 'lead', name: 'Maria Fixture', phone: '+14075550100', state: 'FL', lead_language: language }
      const sends: string[] = []
      const db = database(q => {
        if (q.table === 'leads') return { data: lead }
        if (q.table === 'buyers') return { data: { name: 'Agent Fixture' } }
        if (q.table === 'sms_messages' && q.calls.some(c => c[0] === 'lte')) return { data: [{ id: 'sms', lead_id: 'lead', to_phone: '14075550100', body: 'Texto em português enfileirado antes da correção' }] }
        return { data: null, count: 0, error: null }
      })
      const app = load('lib/sms-auto.ts', {
        './supabase/admin': { createAdminClient: () => db },
        './twilio': { toE164: (phone: string) => phone, sendSms: async (_phone: string, body: string) => { sends.push(body); return { ok: true, sid: 'fixture' } } },
        './availability': { buyerTimezone: () => 'America/New_York' },
        './lead-message-locale': locale,
        './lead-message-template': { translateLeadCopy: async (_db: any, source: any, resolved: string) => {
          assert.equal(source.body, 'Texto em português enfileirado antes da correção')
          assert.equal(resolved, language)
          return { body: `translated-${resolved}`, subject: null }
        } },
      })
      if (scheduled) {
        assert.equal(await app.dispatchScheduledSms(), language ? 1 : 0)
        if (language) assert.equal(sends[0], `translated-${language}`)
      } else if (language) {
        assert.equal(await app.sendOrScheduleAutoSms(db, 'lead', 'buyer'), 'sent')
        assert.equal(sends[0], app.buildSmsBody(lead.name, 'Agent Fixture', language))
      } else {
        await assert.rejects(app.sendOrScheduleAutoSms(db, 'lead', 'buyer'), /\[lead-language\]/)
      }
      assert.equal(sends.length, language ? 1 : 0)
      if (scheduled && language) assert.ok(db.queries.some(q => q.calls.some(c => c[0] === 'update' && c[1].body === `translated-${language}`)))
    }
  }
})

test('template preview translates for the recipient without invoking any transport', async () => {
  const db = database(q => ({ data: q.table === 'leads' ? { name: 'Maria Fixture', lead_language: 'es' }
    : q.table === 'buyers' ? { name: 'Agent Fixture' }
    : { name: 'Primeiro contato', is_system: true, type: 'whatsapp', body: 'Oi {primeiro_nome}' } }))
  const app = load('app/api/templates/send/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/template-render': renderer,
    '@/lib/lead-message-template': templates,
    '@/lib/lead-message-locale': locale,
    '@/lib/locale': { getLocale: async () => 'pt' },
    '@/lib/pipeline-guard': { atorDaSessao: async () => ({ isAdmin: false }), podeOperarQuadro: async () => true, leadPertenceAoQuadro: async () => true },
    '@/lib/send-guard': { checkSendRate: () => { throw new Error('Preview must not send') } },
    '@/lib/wa-bridge': { resolveSendBridge: () => { throw new Error('Preview must not send') } },
    resend: { Resend: class { constructor() { throw new Error('Preview must not send') } } },
  })
  const response = await app.POST({ json: async () => ({ template_id: 'tpl', buyer_id: 'buyer', lead_id: 'lead', preview: true }) })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.message_locale, 'es')
  assert.match(result.sent_body, /¡Hola Maria!/)
  assert.ok(db.queries.every(q => !q.calls.some(c => ['insert', 'update', 'upsert'].includes(c[0]))))
})

test('pipeline and mobile data retain contact language instead of dropping it before rendering', () => {
  const source = readFileSync(new URL('../src/app/api/pipelines/[id]/leads/route.ts', import.meta.url), 'utf8')
  assert.match(source, /lead:leads!inner\([^)]*lead_language, form_name, meta_lead_id/)
  for (const path of ['app/dashboard/pipeline/lead-card.tsx', 'app/dashboard/pipeline/lead-modal.tsx', 'app/m/pipeline/page.tsx', 'app/m/leads/[id]/page.tsx']) {
    assert.match(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), /<LeadLanguageBadge lead=/)
  }
})
