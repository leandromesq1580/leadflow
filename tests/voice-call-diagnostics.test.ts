import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCallDiagnostics } from '../src/lib/voice-call-diagnostics'

test('extrai código SIP e erro do callback do Twilio, só números válidos', () => {
  assert.deepEqual(extractCallDiagnostics({ SipResponseCode: '480', ErrorCode: '31480' }), { sip_response_code: 480, error_code: 31480 })
  assert.deepEqual(extractCallDiagnostics({ DialSipResponseCode: '486' }), { sip_response_code: 486, error_code: null })
})
test('ausente ou lixo vira null, nunca quebra', () => {
  assert.deepEqual(extractCallDiagnostics({}), { sip_response_code: null, error_code: null })
  assert.deepEqual(extractCallDiagnostics({ SipResponseCode: 'x', ErrorCode: '99999999' }), { sip_response_code: null, error_code: null })
})
