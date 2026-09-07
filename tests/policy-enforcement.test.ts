import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkExchangeEligibility } from '../src/lib/lead-exchange'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('current policy version forces a renewed acceptance in every authenticated app shell', () => {
  assert.match(source('src/lib/policies.ts'), /CURRENT_POLICY_VERSION = '2026-09-07\.1'/)
  for (const file of [
    'src/app/dashboard/layout.tsx',
    'src/app/m/layout.tsx',
    'src/app/admin/layout.tsx',
    'src/app/onboarding/layout.tsx',
  ]) {
    const code = source(file)
    assert.match(code, /hasAcceptedCurrentPolicy/)
    assert.match(code, /PolicyAcceptanceGate/)
  }
})

test('new registration requires and records the exact current policy version', () => {
  const page = source('src/app/register/page.tsx')
  const route = source('src/app/api/auth/register/route.ts')
  assert.match(page, /policy_accepted: true/)
  assert.match(page, /policy_version: CURRENT_POLICY_VERSION/)
  assert.match(route, /policy_accepted !== true \|\| policy_version !== CURRENT_POLICY_VERSION/)
  assert.match(route, /recordPolicyAcceptance/)
})

test('full policy and mandatory gate contain the four rules in Portuguese, English, and Spanish', () => {
  const page = source('src/components/localized-policy-page.tsx')
  const gate = source('src/components/policy-acceptance-gate.tsx')
  for (const code of [page, gate]) {
    assert.match(code, /7 dias|7-day|7 días/)
    assert.match(code, /renova automaticamente|renovação automática|renew automatically|renews automatically|renueva automáticamente|se renuevan automáticamente/)
    assert.match(code, /não inclui|does not include|no incluye/)
    assert.match(code, /telefone|phone|teléfono/)
    assert.match(code, /e-mail|email|correo/)
  }
  assert.match(page, /pt:/)
  assert.match(page, /en:/)
  assert.match(page, /es:/)
})

function leadDb(lead: Record<string, unknown>) {
  return {
    from(table: string) {
      assert.equal(table, 'leads')
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        maybeSingle: async () => ({ data: lead, error: null }),
      }
      return chain
    },
  } as any
}

test('lead exchange depends only on ownership and an explicit invalid contact declaration', async () => {
  const owned = leadDb({
    id: 'lead-1', assigned_to: 'buyer-1', assigned_at: new Date().toISOString(),
    phone: '+15555550100', email: 'lead@example.invalid',
  })
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'buyer-1')).eligible, true)
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'buyer-1', { invalidContact: 'phone' })).eligible, true)
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'buyer-1', { invalidContact: 'email' })).eligible, true)
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'buyer-1', { invalidContact: 'both' })).eligible, true)
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'buyer-1', { invalidContact: 'no-response' })).eligible, false)
  assert.equal((await checkExchangeEligibility(owned, 'lead-1', 'another-buyer', { invalidContact: 'phone' })).eligible, false)
})

test('approved invalid leads are archived and never recycled into cold inventory', () => {
  const route = source('src/app/api/admin/lead-exchanges/route.ts')
  assert.match(route, /archived: true/)
  assert.match(route, /from\('pipeline_leads'\)\.delete\(\)/)
  assert.doesNotMatch(route, /type: 'cold'/)
  assert.doesNotMatch(source('src/lib/lead-exchange.ts'), /WINDOW_DAYS|MIN_ATTEMPT_DAYS|CAP_PCT/)
})
