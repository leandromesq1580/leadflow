import test from 'node:test'
import assert from 'node:assert/strict'
import { pickSmsPlan, validateSmsTemplate, renderSmsTemplate, SMS_CHOICE_MAX_AGE_MS } from '../src/lib/sms-call-choice'

const now = Date.parse('2026-11-05T15:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const tpls = [{ id: 'a', body: 'Texto A', is_default: false }, { id: 'b', body: 'Texto B', is_default: true }]

test('sem escolha e sem modelo = texto do sistema (nada muda para quem não mexeu)', () => {
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice: null, templates: [], now }), { kind: 'default' })
})
test('modelo padrão do comprador vale quando não há escolha na ligação', () => {
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice: null, templates: tpls, now }), { kind: 'template', templateId: 'b', body: 'Texto B' })
})
test('"não enviar nesta ligação" pula, mesmo com modelo padrão', () => {
  const choice = { mode: 'off' as const, template_id: null, updated_at: ago(60_000) }
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice, templates: tpls, now }), { kind: 'skip', why: 'call_off' })
})
test('escolha de modelo na ligação vence o padrão', () => {
  const choice = { mode: 'template' as const, template_id: 'a', updated_at: ago(60_000) }
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice, templates: tpls, now }), { kind: 'template', templateId: 'a', body: 'Texto A' })
})
test('chave geral desligada vence tudo', () => {
  const choice = { mode: 'template' as const, template_id: 'a', updated_at: ago(1000) }
  assert.deepEqual(pickSmsPlan({ autoEnabled: false, choice, templates: tpls, now }), { kind: 'skip', why: 'buyer_off' })
})
test('"não enviar" velho (> 30 min) não vale para uma ligação nova', () => {
  const choice = { mode: 'off' as const, template_id: null, updated_at: ago(SMS_CHOICE_MAX_AGE_MS + 1000) }
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice, templates: [], now }), { kind: 'default' })
})
test('modelo escolhido que foi apagado cai no padrão, não em silêncio', () => {
  const choice = { mode: 'template' as const, template_id: 'zzz', updated_at: ago(1000) }
  assert.deepEqual(pickSmsPlan({ autoEnabled: true, choice, templates: tpls, now }), { kind: 'template', templateId: 'b', body: 'Texto B' })
})
test('validação: variável desconhecida, chave solta, vazio e tamanho', () => {
  assert.equal(validateSmsTemplate({ name: 'x', body: 'Oi {nome}, aqui é {corretor}' }).ok, true)
  assert.equal(validateSmsTemplate({ name: 'x', body: 'Oi {first_name}' }).ok, false)
  assert.equal(validateSmsTemplate({ name: 'x', body: 'Oi {nome' }).ok, false)
  assert.equal(validateSmsTemplate({ name: '', body: 'ok' }).ok, false)
  assert.equal(validateSmsTemplate({ name: 'x', body: '   ' }).ok, false)
  assert.equal(validateSmsTemplate({ name: 'x', body: 'a'.repeat(321) }).ok, false)
  assert.equal(validateSmsTemplate({ name: 'x', body: 'a'.repeat(320) }).ok, true)
})
test('render: primeiro nome do lead, corretor e fallback sem nome', () => {
  assert.equal(renderSmsTemplate('Oi {nome}! Aqui é {corretor}.', { leadName: 'Maria Luisa Fernández', buyerName: 'Sebastian Franco' }), 'Oi Maria! Aqui é Sebastian Franco.')
  assert.equal(renderSmsTemplate('Aqui é {corretor}.', { leadName: 'Maria', buyerName: '', buyerFallback: 'seu corretor' }), 'Aqui é seu corretor.')
})
