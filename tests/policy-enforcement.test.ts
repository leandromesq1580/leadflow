import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('CURRENT_POLICY_SHA256 matches the published policy document (dossiê de chargeback cita esse hash)', () => {
  const sha = createHash('sha256').update(source('src/components/localized-policy-page.tsx')).digest('hex')
  assert.match(source('src/lib/policies.ts'), new RegExp(`CURRENT_POLICY_SHA256 = '${sha}'`))
})

test('current policy version forces a renewed acceptance in every authenticated app shell', () => {
  assert.match(source('src/lib/policies.ts'), /CURRENT_POLICY_VERSION = '2026-10-08\.1'/)
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
    assert.match(code, /não são trocáveis/)
    assert.match(code, /not exchangeable/)
    assert.match(code, /no son intercambiables/)
    // A troca de lead foi removida: nenhum texto pode prometer troca por telefone/e-mail inválido.
    assert.doesNotMatch(code, /troca de lead só pode|exchange may only be requested|solicitar el cambio de un lead/i)
  }
  assert.match(page, /pt:/)
  assert.match(page, /en:/)
  assert.match(page, /es:/)
})

test('lead exchange feature is removed from the codebase', () => {
  for (const file of [
    'src/lib/lead-exchange.ts',
    'src/app/dashboard/pipeline/exchange-box.tsx',
    'src/app/api/leads/[id]/exchange/route.ts',
    'src/app/api/admin/lead-exchanges/route.ts',
    'src/app/admin/trocas/page.tsx',
  ]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, `${file} should be removed`)
  }
  assert.doesNotMatch(source('src/app/dashboard/pipeline/lead-modal.tsx'), /ExchangeBox|exchange-box/)
})
