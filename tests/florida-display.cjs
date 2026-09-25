/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness (same convention as the other *.cjs suites) */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '..')
function load(relative, dependencies = {}) {
  const filename = path.join(root, relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  const localRequire = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? `src/${name.slice(2)}` : path.relative(root, path.resolve(path.dirname(filename), name))
      const resolved = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map(ext => base + ext).find(p => fs.existsSync(path.join(root, p)))
      assert.ok(resolved, `Unresolved fixture module ${name}`)
      return load(resolved, dependencies)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}
// All records here are synthetic test fixtures; no real user or network access.
const lead = { id: 'synthetic-test-lead', name: 'Synthetic Test', phone: '', email: '', city: '', state: 'FL', status: 'assigned', type: 'hot', created_at: '2026-07-15T10:47:25Z', assigned_at: '2026-07-15T10:48:43Z' }
function deps(locale = 'pt', record = lead) {
  return {
    '@/lib/i18n-client': { useT: () => ({ _locale: locale }) },
    '@/lib/privacy-mode': { usePrivacy: () => ({ enabled: false, mask: value => value }) },
    '@/lib/locale': { getLocale: async () => locale },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-auth' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
      const query = { select: () => query, eq: () => query, single: async () => ({ data: record }), order: async () => ({ data: table === 'lead_activity' ? [{ id: 'test-activity', action: 'Synthetic action', created_at: '2026-07-15T10:49:00Z' }] : [] }) }
      return query
    } }) },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { redirect: () => { throw Error('unexpected redirect') } },
    './assign-button': { AssignButton: () => null },
  }
}

test('desktop detail renders origin and CRM delivery separately in Florida time', async () => {
  const Page = load('src/app/dashboard/leads/[id]/page.tsx', deps()).default
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: lead.id }) }))
  assert.match(html, /Entrada do lead/)
  assert.match(html, /Entregue ao cliente \(CRM\)/)
  assert.match(html, /15\/07\/2026, 06:47/)
  assert.match(html, /15\/07\/2026, 06:48/)
  assert.match(html, /06:49/)
  assert.doesNotMatch(html, /10:4[789]|Recebido em/)
})

test('desktop detail prefers the WhatsApp delivery instant (notified_at) over CRM assignment', async () => {
  const Page = load('src/app/dashboard/leads/[id]/page.tsx', deps('pt', { ...lead, notified_at: '2026-07-15T10:52:10Z' })).default
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: lead.id }) }))
  assert.match(html, /Entregue no WhatsApp/)
  assert.match(html, /15\/07\/2026, 06:52/)
  assert.doesNotMatch(html, /Entregue ao cliente \(CRM\)|06:48/)
})

test('received-leads list uses CRM assignment, not original creation timestamp', () => {
  const List = load('src/app/dashboard/leads/leads-list.tsx', deps()).LeadsList
  const html = renderToStaticMarkup(React.createElement(List, { leads: [lead], isAgency: false, teamMembers: [] }))
  assert.match(html, /Entregue ao cliente \(CRM\)/)
  assert.match(html, /15\/07\/2026, 06:48/)
  assert.doesNotMatch(html, /06:47|10:47/)
  const delivered = renderToStaticMarkup(React.createElement(List, { leads: [{ ...lead, notified_at: '2026-07-15T10:52:10Z' }], isAgency: false, teamMembers: [] }))
  assert.match(delivered, /Entregue no WhatsApp: 15\/07\/2026, 06:52/)
  assert.doesNotMatch(delivered, /CRM|06:48/)
})

function clientDeps(values, locale = 'pt') {
  let i = 0
  return { ...deps(locale), react: { ...React, useState: initial => [i < values.length ? values[i++] : initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
    'next/navigation': { useParams: () => ({ id: lead.id, leadId: lead.id }), useRouter: () => ({ back: () => {}, push: () => {} }) },
    '@/components/mobile/assign-sheet': { AssignSheet: () => null },
    '@/components/mobile/status-sheet': { StatusSheet: () => null },
    '@/components/mobile/followup-sheet': { FollowupSheet: () => null },
    '@/components/mobile/tag-sheet': { TagSheet: () => null },
  }
}

test('mobile detail keeps separate origin and delivery, including missing assignment', () => {
  for (const assigned_at of [lead.assigned_at, null]) {
    const Page = load('src/app/m/leads/[id]/page.tsx', clientDeps([{ ...lead, assigned_at }, false, null, false, [], [], [], ''])).default
    const html = renderToStaticMarkup(React.createElement(Page))
    assert.match(html, /Entrada do lead/)
    assert.match(html, /Entregue ao cliente \(CRM\)/)
    assert.match(html, /15\/07\/2026, 06:47/)
    if (assigned_at) assert.match(html, /15\/07\/2026, 06:48/)
    else assert.doesNotMatch(html, /06:48/)
  }
})

test('mobile received list displays exact delivery time', () => {
  const Page = load('src/app/m/leads/page.tsx', clientDeps([[lead], false, 'all', '', false, [], null])).default
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /15\/07\/2026, 06:48/)
  assert.doesNotMatch(html, /06:47|10:47/)
  const Delivered = load('src/app/m/leads/page.tsx', clientDeps([[{ ...lead, notified_at: '2026-07-15T10:52:10Z' }], false, 'all', '', false, [], null])).default
  const delivered = renderToStaticMarkup(React.createElement(Delivered))
  assert.match(delivered, /Entregue no WhatsApp: 15\/07\/2026, 06:52/)
  assert.doesNotMatch(delivered, /CRM|06:48/)
  const Detail = load('src/app/m/leads/[id]/page.tsx', clientDeps([{ ...lead, notified_at: '2026-07-15T10:52:10Z' }, false, null, false, [], [], [], ''])).default
  const detail = renderToStaticMarkup(React.createElement(Detail))
  assert.match(detail, /Entregue no WhatsApp/)
  assert.match(detail, /15\/07\/2026, 06:52/)
  assert.doesNotMatch(detail, /CRM/)
})

test('mobile conversation formats actual sent_at in account locale and Florida time', () => {
  for (const locale of ['pt', 'en', 'es']) {
    const Page = load('src/app/m/whatsapp/[leadId]/page.tsx', clientDeps([null, lead, [{ id: 'test-message', direction: 'in', body: 'Synthetic message', sent_at: lead.created_at }], '', false, null, ''], locale)).default
    const html = renderToStaticMarkup(React.createElement(Page))
    assert.match(html, /06:47/)
    assert.doesNotMatch(html, /10:47/)
    if (locale === 'en') assert.match(html, /AM/)
  }
})

test('admin client inbox displays Florida day and time for synthetic messages', () => {
  const conversation = { buyer_id: 'test-buyer', name: 'Synthetic Test', phone: '', last_at: '2026-07-15T03:47:00Z', crm_plan: 'pro' }
  const Inbox = load('src/components/dashboard/clients-inbox.tsx', clientDeps([[conversation], 'test-buyer', [{ id: 'test-message', direction: 'in', body: 'Synthetic message', created_at: conversation.last_at }], '', false, ''])).ClientsInbox
  const html = renderToStaticMarkup(React.createElement(Inbox))
  assert.match(html, /14\/07/)
  assert.match(html, /23:47/)
})

test('all authenticated shells visibly declare Florida East Coast timezone in every locale', async () => {
  for (const locale of ['pt', 'en', 'es']) {
    for (const file of ['src/app/dashboard/layout.tsx', 'src/app/admin/layout.tsx', 'src/app/m/layout.tsx']) {
      const dependency = deps(locale)
      const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      for (const node of source.statements.filter(ts.isImportDeclaration)) {
        const name = node.moduleSpecifier.text
        if (name.startsWith('@/components/') && name !== '@/components/florida-time-notice') {
          for (const element of node.importClause?.namedBindings?.elements || []) dependency[name] = { ...dependency[name], [element.name.text]: ({ children }) => children || null }
        }
      }
      dependency['./m-theme.css'] = {}
      dependency['@/lib/privacy-mode'] = { PrivacyProvider: ({ children }) => children }
      dependency['@/lib/i18n-client'] = { I18nProvider: ({ children }) => children }
      dependency['@/lib/crm-access'] = { isTrialActive: () => false, trialDaysRemaining: () => 0, isAppointmentOnly: () => false, isLeadOnly: () => false }
      dependency['@/lib/policies-access'] = { podeVerApolices: async () => false }
      dependency['@/lib/policies'] = { hasAcceptedCurrentPolicy: async () => true }
      dependency['next/headers'] = { headers: async () => ({ get: () => '' }), cookies: async () => ({ get: () => null }) }
      dependency['@/lib/supabase/admin'] = { createAdminClient: () => ({ from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { id: 'test-buyer', name: 'Synthetic Test', is_admin: true, is_active: true, crm_plan: 'pro' } }) }; return q } }) }
      const Layout = load(file, dependency).default
      const html = renderToStaticMarkup(await Layout({ children: React.createElement('p', null, 'Synthetic content') }))
      assert.match(html, /America\/New_York/, `${file} should visibly state its timezone`)
      assert.match(html, locale === 'pt' ? /Flórida.*costa leste/ : locale === 'en' ? /Florida.*East Coast/ : /Florida.*costa este/)
    }
  }
})

test('timestamp display expressions across dashboard admin mobile pipeline and history ignore host timezone', () => {
  const files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(p => p.endsWith('.tsx') && (p.startsWith('app/') || p.startsWith('components/')))
  const failures = []
  let checked = 0
  const formatter = load('src/lib/florida-time.ts').formatFloridaDateTime
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(source)
        const receiver = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression.getText(source) : ''
        const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ''
        // Synthetic revenue month buckets are dates, not instants.
        const monthBucket = file === 'app/admin/revenue/page.tsx' && receiver === 'd'
        const nativeDate = /^toLocale(DateString|TimeString|String)$/.test(method) && (/^new Date\(/.test(receiver) || /^(d|dt|startDate)$/.test(receiver))
        if (!monthBucket && (nativeDate || expression === 'formatFloridaDateTime')) {
          const args = node.arguments.map(a => a.getText(source))
          const code = nativeDate ? `VALUE.${method}(${args.join(', ')})` : `formatFloridaDateTime(VALUE, ${args.slice(1).join(', ')})`
          const evaluate = new Function('VALUE', 'formatFloridaDateTime', 'locale', 'loc', 'dateLocale', 't', 'LEAD_TZ', `const FLORIDA_TIME_ZONE = LEAD_TZ; return ${code}`)
          const oldTZ = process.env.TZ
          try {
            for (const instant of ['2026-07-15T03:47:00Z', '2026-01-15T10:47:00Z']) {
              process.env.TZ = 'America/New_York'
              const expected = evaluate(new Date(instant), formatter, 'pt', 'pt', 'pt-BR', { _locale: 'pt' }, 'America/New_York')
              process.env.TZ = 'UTC'
              const actual = evaluate(new Date(instant), formatter, 'pt', 'pt', 'pt-BR', { _locale: 'pt' }, 'America/New_York')
              if (actual !== expected) failures.push(`${file}: ${expression} -> ${actual} != ${expected}`)
            }
            checked++
          } finally { if (oldTZ == null) delete process.env.TZ; else process.env.TZ = oldTZ }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(checked >= 40, `Expected broad formatter coverage, got ${checked}`)
  assert.deepEqual(failures, [])
})

test('admin appointment and SMS render real records through midnight and DST', () => {
  for (const [instant, expected] of [
    ['2026-07-15T03:47:00Z', '14/07, 23:47'],
    ['2026-01-15T10:47:00Z', '15/01, 05:47'],
    ['2026-03-08T06:59:00Z', '08/03, 01:59'],
    ['2026-03-08T07:00:00Z', '08/03, 03:00'],
    ['2026-11-01T05:30:00Z', '01/11, 01:30'],
    ['2026-11-01T06:30:00Z', '01/11, 01:30'],
  ]) {
    const AppointmentManager = load('src/app/admin/appointments/appointment-manager.tsx', clientDeps([])).AppointmentManager
    const html = renderToStaticMarkup(React.createElement(AppointmentManager, { appointments: [{ id: 'fixture', scheduled_at: instant, status: 'scheduled', lead_name: 'Synthetic appointment' }], clients: [] }))
    assert.ok(html.includes(expected), `${instant}: ${expected}`)
    const SmsClient = load('src/app/admin/sms/sms-client.tsx', clientDeps(['respostas'])).SmsClient
    const sms = renderToStaticMarkup(React.createElement(SmsClient, { campaigns: [], buyers: [], replies: [{ id: 'fixture', created_at: instant, body: 'Synthetic reply' }] }))
    assert.ok(sms.includes(expected), `${instant}: SMS ${expected}`)
  }
})

test('desktop WhatsApp renders sent_at, not host clock, across locales', () => {
  for (const locale of ['pt', 'en', 'es']) {
    const dependency = clientDeps([[{ id: 'fixture', direction: 'in', body: 'Synthetic message', sent_at: '2026-07-15T03:47:00Z' }], '', false, null, 'whatsapp', false], locale)
    dependency['@/lib/use-realtime'] = { useRealtime: () => {} }
    const Inbox = load('src/components/whatsapp-inbox.tsx', dependency).WhatsAppInbox
    const html = renderToStaticMarkup(React.createElement(Inbox, { leadId: 'fixture', buyerId: 'fixture' }))
    assert.match(html, /11:47 PM/)
    assert.match(html, locale === 'en' ? /07\/14/ : /14\/07/)
  }
})

test('mobile calendar renders Florida dates and literal calendar dates unchanged', () => {
  const dependency = clientDeps(['fixture', [
    { id: 'instant', title: 'Synthetic instant', kind: 'event', start: '2026-07-15T03:47:00Z' },
    { id: 'date', title: 'Synthetic calendar date', kind: 'event', start: '2026-07-15' },
  ], false, null, false])
  dependency['@/lib/i18n-client'] = { useT: () => ({ _locale: 'pt', sidebar: { appointments: 'Agenda' } }) }
  const Page = load('src/app/m/appointments/page.tsx', dependency).default
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /14\/07/)
  assert.match(html, /15\/07/)
  assert.match(html, /23:47/)
  assert.doesNotMatch(html, /03:47|21:00/)
})

test('desktop calendar places records in Florida day/hour cells independent of browser timezone', () => {
  const originalTZ = process.env.TZ
  try {
    for (const view of ['day', 'week', 'month']) {
      const render = timezone => {
        process.env.TZ = timezone
        const events = [
          { id: 'instant', title: 'Synthetic midnight event', kind: 'event', start: '2026-07-15T03:47:00Z', color: '#6366f1' },
          { id: 'literal', title: 'Synthetic literal date', kind: 'task', start: '2026-07-14', color: '#6366f1' },
        ]
        // The anchor is a Florida calendar day, never a browser Date.
        const Page = load('src/app/dashboard/appointments/page.tsx', clientDeps(['fixture', events, false, view, '2026-07-14', null, null, false])).default
        return renderToStaticMarkup(React.createElement(Page))
      }
      const florida = render('America/New_York')
      const utc = render('UTC')
      const brazil = render('America/Sao_Paulo')
      assert.match(utc, /Synthetic midnight event/, view)
      assert.match(utc, /Synthetic literal date/, view)
      assert.match(utc, /11:47 PM/, view)
      assert.equal(utc, florida, `${view}: calendar cells must match, not just formatted times`)
      assert.equal(brazil, florida, `${view}: a Brazil browser must render the same cells as a Florida one`)
    }
  } finally { if (originalTZ == null) delete process.env.TZ; else process.env.TZ = originalTZ }
})

module.exports = { load, deps, lead }
