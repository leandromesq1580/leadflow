import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDate } from '../src/lib/utils'

test('synthetic lead timestamp displays Florida summer time even on a UTC host', () => {
  assert.equal(formatDate('2026-07-15T10:47:25Z', 'pt'), '15/07/2026, 06:47')
})

test('timestamps follow winter, DST jumps, repeated hour, and Florida midnight', () => {
  const cases = [
    ['2026-01-15T10:47:00Z', '15/01/2026, 05:47'],
    ['2026-03-08T06:59:00Z', '08/03/2026, 01:59'],
    ['2026-03-08T07:00:00Z', '08/03/2026, 03:00'],
    ['2026-11-01T05:30:00Z', '01/11/2026, 01:30'],
    ['2026-11-01T06:30:00Z', '01/11/2026, 01:30'],
    ['2026-07-15T03:59:00Z', '14/07/2026, 23:59'],
    ['2026-07-15T04:00:00Z', '15/07/2026, 00:00'],
  ]
  for (const [input, expected] of cases) assert.equal(formatDate(input), expected)
  assert.match(formatDate('2026-07-15T10:47:00Z', 'en'), /07\/15\/2026, 06:47 AM/)
  assert.match(formatDate('2026-07-15T10:47:00Z', 'es'), /15\/07\/2026, 06:47/)
})

test('missing and invalid dates are a placeholder, never epoch or Invalid Date', () => {
  for (const value of [null, undefined, '', 'invalid', new Date(NaN)]) assert.equal(formatDate(value), '—')
})

test('calendar-only dates keep their day and do not invent an hour', () => {
  assert.equal(formatDate('2026-07-15'), '15/07/2026')
  assert.equal(formatDate('2026-02-30'), '—')
})
