import test from 'node:test'
import assert from 'node:assert/strict'
import { durationValue, durationMinutes, durationSummary } from '../src/lib/ai-sequence-form'

test('duration units preserve exact minutes, including fractional days', () => {
  assert.equal(durationValue(2880, 'days'), '2')
  assert.equal(durationValue(90, 'hours'), '1.5')
  assert.equal(durationValue(61, 'days'), '61/1440')
  for (const minutes of [0, 1, 59, 60, 61, 90, 1440, 2880, 43200]) {
    for (const unit of ['minutes', 'hours', 'days'] as const) {
      assert.equal(durationMinutes(durationValue(minutes, unit), unit, 0), minutes)
    }
  }
  assert.equal(durationMinutes('2', 'days', 60), 2880)
  assert.equal(durationMinutes('1,5', 'hours', 60), 90)
  assert.equal(durationSummary(2880), '2 dias')
  assert.equal(durationSummary(61), '61 minutos')
})

test('duration rejects invalid input and sub-minute rounding at both limits', () => {
  for (const raw of ['', ' ', '-1', 'Infinity', '1e3', '1/0', '0.0001', '31', '1.00000000000000000001']) {
    assert.ok(Number.isNaN(durationMinutes(raw, 'days', 60)), raw)
  }
  assert.ok(Number.isNaN(durationMinutes('59', 'minutes', 60)))
  assert.ok(Number.isNaN(durationMinutes('43201', 'minutes', 0)))
  assert.equal(durationMinutes('43200', 'minutes', 60), 43200)
  assert.equal(durationMinutes('0', 'days', 0), 0)
  assert.equal(durationMinutes('0.5', 'days', 60), 720)
  assert.equal(durationMinutes('1/24', 'days', 60), 60)
  for (let minutes = 0; minutes <= 43200; minutes++) {
    for (const unit of ['minutes', 'hours', 'days'] as const) {
      assert.equal(durationMinutes(durationValue(minutes, unit), unit, 0), minutes)
    }
  }
})
