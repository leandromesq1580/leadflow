import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCallFailure } from '../src/components/voice/softphone-errors'

test('só permissão negada de áudio é atribuída ao microfone', () => {
  assert.deepEqual(classifyCallFailure({ code: 31401 }), { reason: 'microphone_permission', code: 31401 })
  assert.equal(classifyCallFailure({ name: 'NotAllowedError' }).reason, 'microphone_permission')
  assert.equal(classifyCallFailure({ code: 20101 }).reason, 'authentication')
  assert.equal(classifyCallFailure({ code: 31205 }).reason, 'authentication')
  assert.equal(classifyCallFailure({ code: 53000 }).reason, 'connection')
  assert.equal(classifyCallFailure(new Error('falha desconhecida (fixture)')).reason, 'unknown')
  const sensitive = { code: 'secret-fixture', message: 'synthetic-token-sensitive' }
  assert.deepEqual(classifyCallFailure(sensitive), { reason: 'unknown', code: null })
})

// 20 e 23/10/2026: lead não atende (toca ~35 s) e o Twilio encerra a perna do navegador com erro 31000.
// A tela mostrava "A ligação falhou. Envie este aviso ao suporte" para uma ligação normal não atendida.
import { isUnansweredRingOut } from '../src/components/voice/softphone-errors'
test('31000 depois de tocar e sem atender é fim de ligação não atendida, não falha', () => {
  assert.equal(isUnansweredRingOut({ reason: 'unknown', code: 31000 }, { ringing: true, accepted: false }), true)
})
test('31000 sem ter tocado, ou com chamada atendida, continua sendo falha', () => {
  assert.equal(isUnansweredRingOut({ reason: 'unknown', code: 31000 }, { ringing: false, accepted: false }), false)
  assert.equal(isUnansweredRingOut({ reason: 'unknown', code: 31000 }, { ringing: true, accepted: true }), false)
})
test('outros códigos nunca são tratados como não atendida', () => {
  for (const code of [31401, 31205, 53000, 31005, null]) {
    assert.equal(isUnansweredRingOut({ reason: 'unknown', code }, { ringing: true, accepted: false }), false)
  }
})
