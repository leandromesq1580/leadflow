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
