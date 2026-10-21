import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sequenceNeedsTrigger } from '../src/lib/sequence-client'

// 21/10/2026: "Não Atendeu 2" da Regiane ficou ativada com trigger_stage_id vazio e nunca inscreveu ninguém;
// o aviso ficava escondido num bloco recolhido.
test('sequência ativada sem etapa gatilho precisa de aviso', () => {
  assert.equal(sequenceNeedsTrigger({ enabled: true, trigger_stage_id: null }), true)
  assert.equal(sequenceNeedsTrigger({ enabled: true }), true)
  assert.equal(sequenceNeedsTrigger({ enabled: true, trigger_stage_id: '' }), true)
})
test('sem aviso quando tem gatilho ou está desligada', () => {
  assert.equal(sequenceNeedsTrigger({ enabled: true, trigger_stage_id: 'abc' }), false)
  assert.equal(sequenceNeedsTrigger({ enabled: false, trigger_stage_id: null }), false)
})
test('a tela usa o aviso na lista e no formulário, fora do bloco recolhido', () => {
  const src = readFileSync('src/app/dashboard/sequences/page.tsx', 'utf8')
  assert.match(src, /sequenceNeedsTrigger\(s\)/)
  assert.match(src, /data-testid="no-trigger-warning-form"/)
  assert.match(src, /data-testid="no-trigger-warning-list"/)
  assert.ok(src.indexOf('no-trigger-warning-form') < src.indexOf('<details'))
})
