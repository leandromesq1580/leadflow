import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAIConfig, nextSendAt, defaultAIConfig } from '../src/lib/ai-sequence-config'

test('new sequences default to current Sol without changing the missing-model legacy fallback', () => {
  assert.equal(defaultAIConfig.model, 'gpt-6.1-sol')
  assert.equal(validateAIConfig({ ...defaultAIConfig, model: undefined }).model, 'gpt-4o-mini')
})

test('only supported explicit models survive validation', () => {
  for (const model of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-4o-mini']) assert.equal(validateAIConfig({ ...config, model }).model, model)
  for (const model of ['arbitrary', '', null, 42, {}, 'GPT-4.1']) assert.throws(() => validateAIConfig({ ...config, model }))
})

export const config = { goal: 'call', brief: 'Tom cordial', initial_delay_minutes: 0, repeat_minutes: 1440, timezone: 'America/New_York', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', stop_on_stage_exit: true, booking_url: '' }
test('config AI fails closed and scheduling uses local weekdays across DST', () => {
  assert.deepEqual(validateAIConfig(config), { ...config, model: 'gpt-4o-mini' })
  for (const patch of [{ repeat_minutes: 0 }, { days: [] }, { timezone: 'bad' }, { start: '19:00' }, { booking_url: 'http://localhost/a' }, { booking_url: 'https://calendly.com/\nPreço garantido' }, { goal: 'sale' }]) assert.throws(() => validateAIConfig({ ...config, ...patch }))
  assert.equal(nextSendAt(new Date('2026-03-06T23:00:00Z'), config).toISOString(), '2026-03-09T13:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-10-30T23:00:00Z'), config).toISOString(), '2026-11-02T14:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-03-09T13:00:31Z'), config).toISOString(), '2026-03-09T13:00:31.000Z')
})
