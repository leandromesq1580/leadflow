import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSmsBody } from '../src/lib/sms-auto'

test('automatic missed-call SMS follows Portuguese, English and Spanish', () => {
  assert.equal(
    buildSmsBody('Maria Luisa Fernández', 'Sebastian Franco', 'pt'),
    'Oi Maria! Aqui é Sebastian Franco. Tentei te ligar sobre sua cotação de seguro de vida, mas não consegui falar com você. Pode me retornar por aqui?',
  )
  assert.equal(
    buildSmsBody('Maria Luisa Fernández', 'Sebastian Franco', 'en'),
    "Hi Maria! This is Sebastian Franco. I tried to call you about your life insurance quote, but I couldn't reach you. Can you reply here?",
  )
  assert.equal(
    buildSmsBody('Maria Luisa Fernández', 'Sebastian Franco', 'es'),
    '¡Hola Maria! Soy Sebastian Franco. Intenté llamarte sobre tu cotización de seguro de vida, pero no pude comunicarme contigo. ¿Puedes responderme por aquí?',
  )
})

test('automatic SMS keeps a localized fallback when producer name is missing', () => {
  assert.match(buildSmsBody('Maria', null, 'pt'), /seu corretor/)
  assert.match(buildSmsBody('Maria', null, 'en'), /your agent/)
  assert.match(buildSmsBody('Maria', null, 'es'), /tu agente/)
})
