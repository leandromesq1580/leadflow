import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERIOD_HOURS, currentWindow, isAvailableNow, periodRangeLabel, sanitizeHours } from '../src/lib/availability'

const NY = 'America/New_York'
// Setembro/2026 está em EDT (UTC-4). 2026-09-18 é sexta; 2026-09-19 sábado; 2026-09-20 domingo; 2026-09-21 segunda.
const at = (isoLocalEDT: string) => new Date(isoLocalEDT + '-04:00')

test('noite cobre 18h..23h e 0h..7h; as 24 horas têm período', () => {
  assert.deepEqual(PERIOD_HOURS.evening, [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7])
  for (let h = 0; h < 24; h++) {
    const covered = Object.values(PERIOD_HOURS).some(hs => hs.includes(h))
    assert.ok(covered, `hora ${h} sem período`)
  }
  assert.equal(periodRangeLabel('evening'), '6 PM–8 AM')
})

test('madrugada pertence à noite do dia ANTERIOR', () => {
  // sexta 22h → weekday/evening
  assert.deepEqual(currentWindow(NY, at('2026-09-18T22:00:00')), { day_type: 'weekday', period: 'evening', hour: 22 })
  // sábado 03h → ainda a noite de sexta (weekday), não saturday
  assert.deepEqual(currentWindow(NY, at('2026-09-19T03:00:00')), { day_type: 'weekday', period: 'evening', hour: 3 })
  // segunda 02h → noite de domingo (sunday)
  assert.deepEqual(currentWindow(NY, at('2026-09-21T02:00:00')), { day_type: 'sunday', period: 'evening', hour: 2 })
  // segunda 08h → manhã de segunda (vira o dia às 8h)
  assert.deepEqual(currentWindow(NY, at('2026-09-21T08:00:00')), { day_type: 'weekday', period: 'morning', hour: 8 })
  // sábado 07h → noite de sexta; sábado 18h → noite de sábado
  assert.equal(currentWindow(NY, at('2026-09-19T07:00:00')).day_type, 'weekday')
  assert.equal(currentWindow(NY, at('2026-09-19T18:00:00')).day_type, 'saturday')
})

test('"Noite inteira" recebe de madrugada; horas marcadas restringem', () => {
  const inteira = [{ day_type: 'weekday', period: 'evening', hours: null }]
  assert.equal(isAvailableNow(inteira, NY, at('2026-09-18T23:30:00')), true)   // sexta 23h30
  assert.equal(isAvailableNow(inteira, NY, at('2026-09-19T03:00:00')), true)   // sábado 3h = noite de sexta
  assert.equal(isAvailableNow(inteira, NY, at('2026-09-21T03:00:00')), false)  // segunda 3h = noite de domingo (não marcada)
  assert.equal(isAvailableNow(inteira, NY, at('2026-09-18T12:00:00')), false)  // tarde não marcada

  const soCedo = [{ day_type: 'weekday', period: 'evening', hours: [18, 19, 20] }]
  assert.equal(isAvailableNow(soCedo, NY, at('2026-09-18T20:30:00')), true)
  assert.equal(isAvailableNow(soCedo, NY, at('2026-09-18T21:30:00')), false)
  assert.equal(isAvailableNow(soCedo, NY, at('2026-09-19T03:00:00')), false)  // sem madrugada
})

test('sanitizeHours aceita as horas da madrugada na noite e rejeita fora do período', () => {
  assert.deepEqual(sanitizeHours('evening', [23, 0, 1, 7, 8, 12]), [0, 1, 7, 23])
  assert.deepEqual(sanitizeHours('morning', [7, 8]), [8])
})

test('virada do horário de verão não muda o dia da noite (bug pego na verificação)', () => {
  // fall-back: domingo 01/11/2026 07:30 EST ainda é a noite de SÁBADO
  assert.deepEqual(currentWindow(NY, new Date('2026-11-01T07:30:00-05:00')), { day_type: 'saturday', period: 'evening', hour: 7 })
  // domingo 01/11 01:30 EDT (antes de atrasar o relógio) também é noite de sábado
  assert.equal(currentWindow(NY, new Date('2026-11-01T01:30:00-04:00')).day_type, 'saturday')
  // spring-forward: segunda 09/03/2026 00:30 EDT é a noite de DOMINGO
  assert.deepEqual(currentWindow(NY, new Date('2026-03-09T00:30:00-04:00')), { day_type: 'sunday', period: 'evening', hour: 0 })
  // e às 8h de cada um desses dias o dia vira normalmente
  assert.equal(currentWindow(NY, new Date('2026-11-01T08:00:00-05:00')).day_type, 'sunday')
  assert.equal(currentWindow(NY, new Date('2026-03-09T08:00:00-04:00')).day_type, 'weekday')
  // Chicago e Anchorage idem
  assert.equal(currentWindow('America/Chicago', new Date('2026-11-01T07:30:00-06:00')).day_type, 'saturday')
  assert.equal(currentWindow('America/Anchorage', new Date('2026-11-01T07:30:00-09:00')).day_type, 'saturday')
})
