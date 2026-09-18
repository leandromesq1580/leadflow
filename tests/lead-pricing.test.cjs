const { test } = require('node:test')
const assert = require('node:assert/strict')
// objetos criados dentro do vm têm outro Array.prototype → comparar por valor, sem checar protótipo
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg)
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Carrega TS de verdade (sem build): '@/x' → src/x.ts; './x' relativo ao arquivo; 'stripe' mockado.
function load(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative)
  const dir = path.dirname(relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, console: { ...console, error() {} },
    require: name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks)
      if (name.startsWith('./') || name.startsWith('../')) return load(path.normalize(path.join(dir, name)) + '.ts', mocks)
      return require(name)
    },
  }, { filename })
  return module.exports
}

const BASE_MOCKS = { stripe: class Stripe {} }
const lib = load('src/lib/lead-pricing.ts', BASE_MOCKS)
const { PRODUCTS } = load('src/lib/stripe.ts', BASE_MOCKS)
const {
  defaultCatalog, defaultCatalogInput, validateCatalogInput, buildCatalog, readPricingCatalog, readPricingCatalogOrDefault,
  findPackage, savePricingCatalog, summarizeCatalogInput, PRICING_SETTINGS_KEY, PRICING_HISTORY_KEY, PRICING_HISTORY_MAX,
} = lib

/** settings em memória (key → {value, updated_at}); registra todo upsert. */
function settingsDb(initial = {}, { readError = null } = {}) {
  const rows = { ...initial }
  const writes = []
  return {
    rows, writes,
    from(table) {
      assert.equal(table, 'settings')
      let key = null
      const q = {
        select() { return q },
        eq(col, v) { if (col === 'key') key = v; return q },
        async maybeSingle() { if (readError) return { data: null, error: readError }; return { data: rows[key] ? { ...rows[key] } : null, error: null } },
        async upsert(row) { writes.push(row); rows[row.key] = { value: row.value, updated_at: row.updated_at }; return { error: null } },
      }
      return q
    },
  }
}
const actor = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.test' }
const custom = { lead: { packages: [{ quantity: 10, unitPriceCents: 3000 }, { quantity: 30, unitPriceCents: 2750 }] }, cold_lead: { packages: [] } }

test('padrão de fábrica espelha PRODUCTS (ids, preços, âncora $28)', () => {
  const c = defaultCatalog()
  assert.equal(c.source, 'default')
  same(c.lead.packages.map(p => [p.id, p.quantity, p.unitPriceCents, p.totalDisplay]), [['lead_10', 10, 2800, 280], ['lead_25', 25, 2600, 650], ['lead_50', 50, 2300, 1150]])
  same(c.cold_lead.packages.map(p => p.id), ['cold_25', 'cold_50', 'cold_100'])
  assert.equal(c.anchorLeadCents, 2800)
  assert.equal(c.lead.packages[2].label, '50 Leads — $1,150')
  same(defaultCatalogInput().lead.packages, PRODUCTS.lead.packages.map(p => ({ quantity: p.quantity, unitPriceCents: p.unitPriceCents })))
})

test('validação: rejeita centavos quebrados, fora da faixa, quantidade repetida/zero, lead sem pacote e mais de 6', () => {
  const ok = validateCatalogInput({ lead: { packages: [{ quantity: 25, unitPriceCents: 2600 }, { quantity: 10, unitPriceCents: 2800, extra: 1 }] }, cold_lead: { packages: [] }, junk: true })
  assert.equal(ok.ok, true)
  same(ok.value.lead.packages, [{ quantity: 10, unitPriceCents: 2800 }, { quantity: 25, unitPriceCents: 2600 }]) // ordenado, sem campo extra
  const bad = [
    null, {}, { lead: { packages: [] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10, unitPriceCents: 2800.5 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10, unitPriceCents: 99 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10, unitPriceCents: 100001 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 0, unitPriceCents: 2800 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10.5, unitPriceCents: 2800 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10, unitPriceCents: 2800 }, { quantity: 10, unitPriceCents: 2700 }] }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: '10', unitPriceCents: 'abc' }] }, cold_lead: { packages: [] } },
    { lead: { packages: Array.from({ length: 7 }, (_, i) => ({ quantity: i + 1, unitPriceCents: 2800 })) }, cold_lead: { packages: [] } },
    { lead: { packages: [{ quantity: 10, unitPriceCents: 2800 }] } }, // cold_lead ausente
  ]
  for (const raw of bad) assert.equal(validateCatalogInput(raw).ok, false, JSON.stringify(raw))
  // string numérica válida é aceita (vem de input HTML)
  assert.equal(validateCatalogInput({ lead: { packages: [{ quantity: '10', unitPriceCents: '2800' }] }, cold_lead: { packages: [] } }).ok, true)
})

test('buildCatalog deriva id/total/rótulo; centavos aparecem no rótulo', () => {
  const c = buildCatalog(custom, { source: 'db', updatedAt: 'x', updatedBy: 'y' })
  same(c.lead.packages.map(p => [p.id, p.totalCents, p.pricePerUnit, p.totalDisplay, p.label]),
    [['lead_10', 30000, 30, 300, '10 Leads — $300'], ['lead_30', 82500, 27.5, 825, '30 Leads — $825']])
  assert.equal(c.anchorLeadCents, 3000)
  same(c.cold_lead.packages, [])
  assert.equal(summarizeCatalogInput(custom), 'Lead: 10=$30 · 30=$27.50 | Frio: —')
})

test('leitura: sem linha = padrão; linha válida = db; erro de banco ou linha inválida LANÇA (nunca cota errado)', async () => {
  assert.equal((await readPricingCatalog(settingsDb())).source, 'default')
  const db = settingsDb({ [PRICING_SETTINGS_KEY]: { value: { ...custom, updated_by: actor.id }, updated_at: '2026-09-18T00:00:00Z' } })
  const c = await readPricingCatalog(db)
  assert.equal(c.source, 'db'); assert.equal(c.updatedBy, actor.id); assert.equal(c.lead.packages[0].unitPriceCents, 3000)
  await assert.rejects(readPricingCatalog(settingsDb({}, { readError: { code: 'offline' } })))
  await assert.rejects(readPricingCatalog(settingsDb({ [PRICING_SETTINGS_KEY]: { value: { lead: { packages: [{ quantity: 10, unitPriceCents: 1 }] }, cold_lead: { packages: [] } } } })))
  // telas que só exibem caem no padrão em vez de quebrar
  assert.equal((await readPricingCatalogOrDefault(settingsDb({}, { readError: { code: 'offline' } }))).source, 'default')
})

test('findPackage acha pelo id derivado e recusa id desconhecido/forjado', () => {
  const c = buildCatalog(custom, { source: 'db', updatedAt: null, updatedBy: null })
  assert.equal(findPackage(c, 'lead_30').pkg.unitPriceCents, 2750)
  assert.equal(findPackage(c, 'lead_30').productType, 'lead')
  for (const id of ['lead_25', 'cold_25', 'appt_10', '', null, 42, { id: 'lead_10' }]) assert.equal(findPackage(c, id), null)
})

test('salvar grava o catálogo e empurra a versão anterior pro histórico (1ª vez = padrão de fábrica), com teto', async () => {
  const db = settingsDb()
  const saved = await savePricingCatalog(db, custom, actor)
  assert.equal(saved.source, 'db'); assert.equal(saved.updatedBy, actor.id)
  const row = db.rows[PRICING_SETTINGS_KEY].value
  same(row.lead, custom.lead); assert.equal(row.updated_by, actor.id); assert.equal(row.updated_by_email, actor.email)
  const hist = db.rows[PRICING_HISTORY_KEY].value.entries
  assert.equal(hist.length, 1); assert.equal(hist[0].source, 'default'); assert.equal(hist[0].replaced_by, actor.id)
  assert.equal(hist[0].summary, 'Lead: 10=$28 · 25=$26 · 50=$23 | Frio: 25=$4 · 50=$4 · 100=$3')
  // 2ª gravação: a anterior (db) entra no topo do histórico
  await savePricingCatalog(db, defaultCatalogInput(), actor)
  const hist2 = db.rows[PRICING_HISTORY_KEY].value.entries
  assert.equal(hist2.length, 2); assert.equal(hist2[0].source, 'db'); assert.equal(hist2[0].summary, 'Lead: 10=$30 · 30=$27.50 | Frio: —')
  for (let i = 0; i < PRICING_HISTORY_MAX + 5; i++) await savePricingCatalog(db, custom, actor)
  assert.equal(db.rows[PRICING_HISTORY_KEY].value.entries.length, PRICING_HISTORY_MAX)
})

// ---- checkout cobra o catálogo VIGENTE (não o PRODUCTS do código) ----
const buyerId = '11111111-1111-4111-8111-111111111111'
function checkout({ settingsRow = null, settingsError = null, team = null } = {}) {
  const sessions = []
  const db = {
    from(table) {
      const q = { select() { return q }, eq() { return q } }
      q.single = q.maybeSingle = async () => {
        if (table === 'buyers') return { data: { id: buyerId, email: 'fictional@example.com', name: 'Test', stripe_customer_id: null }, error: null }
        if (table === 'settings') return { data: settingsRow, error: settingsError }
        if (table === 'sales_team_pricing') return { data: team, error: null }
        return { data: null, error: null }
      }
      return q
    },
  }
  const { POST } = load('src/app/api/checkout/route.ts', {
    ...BASE_MOCKS,
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'session-user' } } }) } }) },
    '@/lib/policies': { hasAcceptedCurrentPolicy: async () => true },
    '@/lib/checkout-policy': { checkoutPolicyMetadata: async () => ({}), stripeTermsConsent: () => ({}) },
    '@/lib/locale': { getLocale: async () => 'pt' },
    '@/lib/referral': { discountForOrder: async () => 0 },
    '@/lib/stripe': { PRODUCTS, getStripe: () => ({ checkout: { sessions: { create: async params => { sessions.push(params); return { url: 'https://checkout.invalid/mock' } } } } }) },
  })
  return { sessions, invoke: body => POST({ json: async () => ({ leadLanguage: 'pt', ...body }) }) }
}
const savedRow = { value: { ...custom, updated_by: actor.id }, updated_at: '2026-09-18T00:00:00Z' }

test('checkout: preço salvo pelo admin é o cobrado; pacote novo (lead_30) compra; pacote removido (lead_25) some', async () => {
  let r = checkout({ settingsRow: savedRow })
  assert.equal((await r.invoke({ packageId: 'lead_10' })).status, 200)
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 3000)
  assert.equal(r.sessions[0].line_items[0].quantity, 10)
  assert.equal(r.sessions[0].metadata.price_per_unit, '30')
  assert.equal(r.sessions[0].metadata.price_source, 'catalog')
  r = checkout({ settingsRow: savedRow })
  assert.equal((await r.invoke({ packageId: 'lead_30' })).status, 200)
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 2750); assert.equal(r.sessions[0].metadata.price_per_unit, '27.5')
  r = checkout({ settingsRow: savedRow })
  assert.equal((await r.invoke({ packageId: 'lead_25' })).status, 400); assert.equal(r.sessions.length, 0)
  r = checkout({ settingsRow: savedRow })
  assert.equal((await r.invoke({ packageId: 'cold_25' })).status, 400) // frio sem pacotes = não vende
})

test('checkout: sem linha salva cobra o padrão de fábrica; falha ao ler preços NÃO cria sessão', async () => {
  let r = checkout()
  assert.equal((await r.invoke({ packageId: 'lead_25' })).status, 200)
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 2600)
  r = checkout({ settingsError: { code: 'offline' } })
  const res = await r.invoke({ packageId: 'lead_10' })
  assert.equal(res.status, 503); assert.equal(r.sessions.length, 0)
  assert.equal((await res.json()).error, 'Compra temporariamente indisponível. Tente novamente em instantes.') // nada de mensagem interna pro comprador
})

test('leitura do admin: linha salva inválida devolve padrão + storedError (tela não trava); checkout segue bloqueado', async () => {
  const { readPricingCatalogForAdmin } = lib
  const db = settingsDb({ [PRICING_SETTINGS_KEY]: { value: { lead: { packages: [{ quantity: 10, unitPriceCents: 28 }] }, cold_lead: { packages: [] } }, updated_at: 'x' } })
  const r = await readPricingCatalogForAdmin(db)
  assert.equal(r.catalog.source, 'default'); assert.match(r.storedError, /entre \$1,00 e \$1\.000,00/)
  await assert.rejects(readPricingCatalog(db))
  // salvar por cima conserta e o histórico marca a linha anterior como inválida
  await savePricingCatalog(db, custom, actor)
  assert.equal((await readPricingCatalogForAdmin(db)).storedError, null)
  assert.match(db.rows[PRICING_HISTORY_KEY].value.entries[0].summary, /linha anterior inválida/)
})

test('indicação: total de leads igual ao valor de um plano CRM paga a recompensa de LEAD (5%), não a do CRM', () => {
  const { rewardCentsFor } = load('src/lib/referral.ts', { ...BASE_MOCKS, './supabase/admin': {}, '@/lib/supabase/admin': {} })
  assert.equal(rewardCentsFor('lead', 9900), 400)     // 10 × $9,90 → 5% (não $10 do CRM mensal)
  assert.equal(rewardCentsFor('lead', 71880), 3500)   // não $70 do CRM anual
  assert.equal(rewardCentsFor('lead', 28000), 1500)   // tabela original de leads mantida
  assert.equal(rewardCentsFor('crm', 9900), 1000)     // CRM mantido
  assert.equal(rewardCentsFor('crm', 28000), 2800)    // 10%
})

test('checkout: equipe de vendas continua pagando o preço dela mesmo com catálogo novo', async () => {
  const r = checkout({ settingsRow: savedRow, team: { is_member: true, lead_unit_price_cents: 2100 } })
  assert.equal((await r.invoke({ packageId: 'lead_10' })).status, 200)
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 2100)
  assert.equal(r.sessions[0].metadata.price_source, 'sales_team')
})
