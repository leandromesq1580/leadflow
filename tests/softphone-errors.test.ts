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

// 02/11/2026: erro 31480 (SIP 480) = telefone do lead indisponível (desligado/fora de área) e 31486 = ocupado.
// A tela mandava "enviar ao suporte" para algo que é só o estado do telefone do lead.
test('31480 e 31486 são telefone do lead indisponível/ocupado, não falha do sistema', () => {
  assert.deepEqual(classifyCallFailure({ code: 31480 }), { reason: 'callee_unavailable', code: 31480 })
  assert.deepEqual(classifyCallFailure({ code: 31486 }), { reason: 'callee_unavailable', code: 31486 })
})
test('31000 e outros códigos seguem como antes', () => {
  assert.equal(classifyCallFailure({ code: 31000 }).reason, 'unknown')
  assert.equal(classifyCallFailure({ code: 31005 }).reason, 'connection')
})

// 04/11/2026: erro 31603 (SIP 603 Decline) = telefone do lead recusou a ligação; antes caía no aviso genérico "envie ao suporte".
test('31603 é telefone do lead que recusou, não falha do sistema', () => {
  assert.deepEqual(classifyCallFailure({ code: 31603 }), { reason: 'callee_declined', code: 31603 })
})

// 10/11/2026: 31404 (SIP 404 / Twilio 13224) = operadora não achou o número; antes caía em "envie ao suporte".
test('31404 é número não encontrado, não falha do sistema', () => {
  assert.deepEqual(classifyCallFailure({ code: 31404 }), { reason: 'number_not_found', code: 31404 })
})
