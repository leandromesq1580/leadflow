import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as language from '../src/lib/lead-message-locale'

const contact = { id: 'fixture-lead', name: 'Synthetic Contact', phone: '15555551001', city: '', state: 'FL', interest: 'Seguro de vida' }
const buyer = { id: 'fixture-buyer', name: 'Synthetic Buyer', email: 'buyer@example.invalid', phone: '15555551002', notification_phone_2: '15555551003' }
const member = { id: 'fixture-member', name: 'Synthetic Member', email: 'member@example.invalid', phone: '15555551004', whatsapp: null, auth_user_id: 'fixture-auth' }

function fixture(t: any, source: Record<string, unknown> | null, locale = 'pt') {
  const whatsapp: any[] = [], emails: any[] = [], push: any[] = [], updates: any[] = [], queries: any[] = []
  const db = { from(table: string) {
    const calls: any[] = []; queries.push({ table, calls })
    const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
      ? (resolve: any) => {
        const write = calls.find(c => c[0] === 'update')
        if (write) updates.push(write[1])
        return Promise.resolve({ data: write ? null : table === 'leads' ? source : { id: 'fixture-member-buyer' }, error: null }).then(resolve)
      }
      : (...args: any[]) => { calls.push([key, ...args]); return chain } })
    return chain
  } }
  const previous = { WA_BRIDGE_URL: process.env.WA_BRIDGE_URL, WHATSAPP_ADMIN_GROUP: process.env.WHATSAPP_ADMIN_GROUP, ADMIN_WHATSAPP: process.env.ADMIN_WHATSAPP }
  process.env.WA_BRIDGE_URL = 'https://bridge.example.invalid'
  process.env.WHATSAPP_ADMIN_GROUP = 'fixture-group@g.us'
  process.env.ADMIN_WHATSAPP = '15555551005'
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
    assert.equal(url, 'https://bridge.example.invalid/send')
    whatsapp.push(JSON.parse(options.body))
    return Response.json({ success: true, id: 'fixture-ack' })
  })
  const dependencies: Record<string, any> = {
    resend: { Resend: class { emails = { send: async (message: any) => { emails.push(message); return { error: null } } } } },
    './buyer-locale': { localeDoBuyer: async () => locale, trad: (loc: string) => (pt: string, en: string, es: string) => loc === 'en' ? en : loc === 'es' ? es : pt },
    './insurance-policies': {},
    './lead-message-locale': language,
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/push-notify': { pushToBuyer: async (...args: any[]) => { push.push(args); return 1 } },
  }
  const js = transpileModule(readFileSync(new URL('../src/lib/notifications.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: 7 },
  }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return { api: module.exports, whatsapp, emails, push, updates, queries }
}

test('notification labels use contact language / authoritative Meta form, never buyer locale or name', () => {
  assert.equal(language.leadNotificationLanguageLabel({ lead_language: 'pt' }), '🇧🇷 Lead BR (português)')
  assert.equal(language.leadNotificationLanguageLabel({ lead_language: 'es' }), '🇪🇸 Lead em espanhol')
  assert.equal(language.leadNotificationLanguageLabel({ lead_language: 'pt', form_name: '1963007337624994' }), '🇪🇸 Lead em espanhol')
  assert.equal(language.leadNotificationLanguageLabel({ lead_language: 'es', form_name: '25952858404333766' }), '🇧🇷 Lead BR (português)')
  for (const ui of ['pt', 'es', 'en']) {
    assert.ok(language.leadNotificationLanguageLabel({ lead_language: 'pt' }, ui).startsWith('🇧🇷'))
    assert.ok(language.leadNotificationLanguageLabel({ lead_language: 'es' }, ui).startsWith('🇪🇸'))
    assert.ok(language.leadNotificationLanguageLabel({ lead_language: 'en' }, ui).startsWith('🇺🇸'))
    assert.ok(language.leadNotificationLanguageLabel({}, ui).startsWith('🌐'))
  }
})

for (const leadLanguage of ['pt', 'es']) for (const locale of ['pt', 'en', 'es']) {
  test(`delivery alert: ${leadLanguage} lead, ${locale} buyer; group, direct, buyer, second phone, email and push`, async t => {
    const source = { meta_lead_id: 'fixture-meta', lead_language: leadLanguage, form_name: null }
    const f = fixture(t, source, locale)
    // Narrow callers (notably retry) omit language. Canonical data must hydrate it.
    assert.equal(await f.api.sendLeadNotificationEmail(buyer, contact), true)
    const adminLabel = language.leadNotificationLanguageLabel(source)
    const recipientLabel = language.leadNotificationLanguageLabel(source, locale)
    assert.deepEqual(f.whatsapp.map(m => m.number), ['fixture-group@g.us', '15555551005', buyer.phone, buyer.notification_phone_2])
    for (const message of f.whatsapp.slice(0, 2)) assert.ok(message.message.includes(`📋 *${contact.name}*\n${adminLabel}\n📞`))
    for (const message of f.whatsapp.slice(2)) assert.ok(message.message.includes(`📋 *${contact.name}*\n${recipientLabel}\n📞`))
    assert.equal(f.emails.length, 1); assert.ok(f.emails[0].html.includes(recipientLabel))
    assert.equal(f.push.length, 1); assert.ok(f.push[0][1].body.startsWith(recipientLabel))
    assert.equal(f.updates.length, 1)
    assert.deepEqual(Object.keys(f.updates[0]), ['notified_at'], 'adding a label must not affect assignment/credits')
    assert.ok(f.queries.find(q => q.table === 'leads').calls.find((c: any[]) => c[0] === 'select')[1].includes('lead_language'))
  })

  test(`team member: ${leadLanguage} lead, ${locale} member; WhatsApp, email and push`, async t => {
    const source = { meta_lead_id: 'fixture-meta', lead_language: leadLanguage, form_name: null }
    const f = fixture(t, source, locale)
    await f.api.sendTeamMemberNotification(member, contact)
    const label = language.leadNotificationLanguageLabel(source, locale)
    assert.equal(f.whatsapp.length, 1)
    assert.equal(f.whatsapp[0].number, member.phone)
    assert.ok(f.whatsapp[0].message.includes(`📋 *${contact.name}*\n${label}\n📞`))
    assert.equal(f.emails.length, 1); assert.ok(f.emails[0].html.includes(label))
    assert.equal(f.push.length, 1); assert.ok(f.push[0][1].body.startsWith(label))
    assert.equal(f.updates.length, 0)
  })
}

for (const leadLanguage of ['pt', 'es']) {
  test(`pending lead alert identifies ${leadLanguage} before delivery, without changing assignment`, async t => {
    const f = fixture(t, null)
    const lead = { ...contact, lead_language: leadLanguage }
    await f.api.notifyGroupLeadPending(lead)
    assert.equal(f.whatsapp.length, 2)
    for (const message of f.whatsapp) assert.ok(message.message.includes(language.leadNotificationLanguageLabel(lead)))
    assert.equal(f.updates.length, 0)
  })
}

test('canonical Spanish form overrides a stale Portuguese row in the actual notification sender', async t => {
  const f = fixture(t, { meta_lead_id: 'fixture-meta', lead_language: 'pt', form_name: '1963007337624994' })
  await f.api.sendLeadNotificationEmail(buyer, { ...contact, lead_language: 'pt' })
  for (const message of f.whatsapp) {
    assert.ok(message.message.includes('🇪🇸 Lead em espanhol'))
    assert.ok(!message.message.includes('🇧🇷'))
  }
})

test('missing language is stated explicitly rather than labelling the lead Brazilian', async t => {
  const f = fixture(t, { meta_lead_id: 'fixture-meta', lead_language: null, form_name: 'unknown-form' })
  await f.api.sendLeadNotificationEmail(buyer, contact)
  for (const message of f.whatsapp) assert.ok(message.message.includes('🌐 Idioma não identificado'))
})

test('manual imports still generate no buyer or member delivery alerts', async t => {
  const f = fixture(t, { meta_lead_id: null, campaign_name: 'Manual', form_name: 'manual_entry', lead_language: 'es' })
  await f.api.sendLeadNotificationEmail(buyer, contact)
  await f.api.sendTeamMemberNotification(member, contact)
  assert.equal(f.whatsapp.length, 0); assert.equal(f.emails.length, 0); assert.equal(f.push.length, 0)
})

test('same secondary phone remains deduplicated', async t => {
  const f = fixture(t, { meta_lead_id: 'fixture-meta', lead_language: 'es', form_name: null })
  await f.api.sendLeadNotificationEmail({ ...buyer, notification_phone_2: '+1 (555) 555-1002' }, contact)
  assert.equal(f.whatsapp.length, 3)
})
