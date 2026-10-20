import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { CURRENT_POLICY_VERSION, CURRENT_POLICY_SHA256 } from '../src/lib/policies'

// Regressão 16/10/2026: versão da política subiu no código sem linha em policy_versions;
// o webhook do Stripe falhou (FK purchase_consents) e uma compra paga ficou sem crédito.
test('a versão vigente da política está registrada em alguma migration, com o mesmo SHA', () => {
  const dir = 'supabase/migrations'
  const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
  const re = new RegExp(`INSERT INTO public\\.policy_versions[^;]*?'${CURRENT_POLICY_VERSION.replace(/\./g, '\\.')}'\\s*,\\s*'${CURRENT_POLICY_SHA256}'`, 's')
  assert.match(sql, re, `policy_versions precisa de ${CURRENT_POLICY_VERSION} com sha256 ${CURRENT_POLICY_SHA256}`)
})
