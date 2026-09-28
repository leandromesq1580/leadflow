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

// ---- Agenda helpers: Florida wall clock <-> UTC instant, independent of the host/browser timezone ----
import { addFloridaDays, floridaDayRange, floridaParts, floridaWallClockToISO, formatFloridaDateTime } from '../src/lib/florida-time'

function withTZ<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = tz
  try { return fn() } finally { if (previous == null) delete process.env.TZ; else process.env.TZ = previous }
}
const HOSTS = ['UTC', 'America/Sao_Paulo', 'America/New_York']

test('a Brazil browser and a Florida browser store the same instant for the same wall-clock choice', () => {
  const results = HOSTS.map(tz => withTZ(tz, () => floridaWallClockToISO('2026-07-15', '10:00')))
  assert.deepEqual(results, ['2026-07-15T14:00:00.000Z', '2026-07-15T14:00:00.000Z', '2026-07-15T14:00:00.000Z'])
  // Browser-local parsing (the old code path) would disagree between hosts; the helper must not.
  const browserLocal = HOSTS.map(tz => withTZ(tz, () => new Date('2026-07-15T10:00:00').toISOString()))
  assert.notEqual(browserLocal[0], browserLocal[1])
  // And what is stored displays back as the chosen wall clock.
  assert.equal(formatFloridaDateTime(results[0]), '15/07/2026, 10:00')
})

test('wall clock to ISO follows winter/summer offsets and DST edges (2026-03-08 gap, 2026-11-01 overlap)', () => {
  for (const tz of HOSTS) withTZ(tz, () => {
    assert.equal(floridaWallClockToISO('2026-07-15', '09:00'), '2026-07-15T13:00:00.000Z', tz)
    assert.equal(floridaWallClockToISO('2026-01-15', '09:00'), '2026-01-15T14:00:00.000Z', tz)
    assert.equal(floridaWallClockToISO('2026-03-08', '01:59'), '2026-03-08T06:59:00.000Z', tz)
    assert.equal(floridaWallClockToISO('2026-03-08', '02:30'), '2026-03-08T07:30:00.000Z', `${tz}: gap rolls forward to 03:30 EDT`)
    assert.equal(floridaWallClockToISO('2026-03-08', '03:00'), '2026-03-08T07:00:00.000Z', tz)
    assert.equal(floridaWallClockToISO('2026-11-01', '01:30'), '2026-11-01T05:30:00.000Z', `${tz}: first (daylight) occurrence`)
    assert.equal(floridaWallClockToISO('2026-11-01', '02:00'), '2026-11-01T07:00:00.000Z', tz)
    assert.equal(floridaWallClockToISO('2026-07-15'), '2026-07-15T04:00:00.000Z', `${tz}: midnight default`)
  })
  assert.equal(floridaWallClockToISO('2026-07-15', ''), '')
  assert.equal(floridaWallClockToISO('', '10:00'), '')
  assert.equal(floridaWallClockToISO('2026-02-30', '10:00'), '')
})

test('prefill parts round-trip: opening an event and saving unchanged keeps the instant on any host', () => {
  for (const tz of HOSTS) withTZ(tz, () => {
    for (const instant of ['2026-07-15T03:47:00Z', '2026-11-01T06:30:00Z', '2026-01-15T10:47:00Z', '2026-07-15T04:00:00Z']) {
      const { date, time } = floridaParts(instant)
      const stored = floridaWallClockToISO(date, time)
      // 2026-11-01T06:30Z (01:30 EST, second occurrence) legitimately maps to the first occurrence.
      const expected = instant === '2026-11-01T06:30:00Z' ? '2026-11-01T05:30:00.000Z' : new Date(instant).toISOString()
      assert.equal(stored, expected, `${tz} ${instant}`)
    }
    assert.deepEqual(floridaParts('2026-07-15T03:47:00Z'), { date: '2026-07-14', time: '23:47' }, tz)
    assert.deepEqual(floridaParts('2026-07-15'), { date: '2026-07-15', time: '00:00' }, tz)
    assert.deepEqual(floridaParts(null), { date: '', time: '' }, tz)
  })
})

test('agenda ranges are Florida days on a Brazil browser, and calendar day arithmetic is timezone-free', () => {
  for (const tz of HOSTS) withTZ(tz, () => {
    assert.deepEqual(floridaDayRange('2026-07-14'), { fromIso: '2026-07-14T04:00:00.000Z', toIso: '2026-07-15T04:00:00.000Z' }, tz)
    assert.deepEqual(floridaDayRange('2026-11-01'), { fromIso: '2026-11-01T04:00:00.000Z', toIso: '2026-11-02T05:00:00.000Z' }, tz)
    assert.deepEqual(floridaDayRange('2026-03-08'), { fromIso: '2026-03-08T05:00:00.000Z', toIso: '2026-03-09T04:00:00.000Z' }, tz)
    assert.equal(floridaDayRange('2026-07-01', 30).toIso, '2026-07-31T04:00:00.000Z', tz)
    assert.equal(addFloridaDays('2026-07-31', 1), '2026-08-01', tz)
    assert.equal(addFloridaDays('2026-03-01', -1), '2026-02-28', tz)
  })
})

test('reminder-style time formatting on a UTC host announces Florida time', () => {
  withTZ('UTC', () => {
    assert.equal(formatFloridaDateTime('2026-07-15T15:00:00Z', 'en', { hour: 'numeric', minute: '2-digit', hour12: true }), '11:00 AM')
  })
})
