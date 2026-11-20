import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COPY } from '../src/app/equipe/[[...lang]]/copy'

test('all recruitment CTAs book on-page, not WhatsApp', () => {
  const page = readFileSync('src/app/equipe/[[...lang]]/page.tsx', 'utf8')
  assert.doesNotMatch(page, /wa\.me/)
  assert.match(page, /BookingProvider/)
  assert.equal(COPY.en.cta, 'Schedule a call')
  assert.equal(COPY.pt.cta, 'Agendar uma conversa')
  assert.equal(COPY.es.cta, 'Agendar una llamada')
})
