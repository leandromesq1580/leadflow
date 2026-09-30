import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAIConfig, nextSendAt, defaultAIConfig, validAISchedule } from '../src/lib/ai-sequence-config'

test('optional presentation is normalized, bounded, and backward compatible without unknown fields', () => {
  assert.equal(defaultAIConfig.presentation, '')
  const legacy = {...defaultAIConfig}; delete legacy.presentation
  assert.equal(validateAIConfig(legacy).presentation, '')
  for (const [input, expected] of [['', ''], ['  ', ''], ['  Oi, sou Ana, agente de life insurance.  ', 'Oi, sou Ana, agente de life insurance.'], ['a'.repeat(300), 'a'.repeat(300)]]) {
    const result = validateAIConfig({...legacy, presentation: input, unknown: 'discard'})
    assert.equal(result.presentation, expected)
    assert.equal('unknown' in result, false)
  }
  for (const presentation of [null, 12, {}, [], true, 'SENSITIVE'.repeat(40)]) {
    assert.throws(() => validateAIConfig({...legacy, presentation}), (error: Error) => error.message.startsWith('Configuração IA inválida') && !error.message.includes('SENSITIVE'))
  }
})

test('new sequences default to current Sol without changing the missing-model legacy fallback', () => {
  assert.equal(defaultAIConfig.model, 'gpt-6.1-sol')
  assert.equal(validateAIConfig({ ...defaultAIConfig, model: undefined }).model, 'gpt-4o-mini')
})

test('only supported explicit models survive validation', () => {
  for (const model of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-4o-mini']) assert.equal(validateAIConfig({ ...config, model }).model, model)
  for (const model of ['arbitrary', '', null, 42, {}, 'GPT-4.1']) assert.throws(() => validateAIConfig({ ...config, model }))
})

export const config = { goal: 'call', brief: 'Tom cordial', initial_delay_minutes: 0, repeat_minutes: 1440, timezone: 'America/New_York', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', stop_on_stage_exit: true, booking_url: '' }
test('schedule draft gates match API bounds, exact clocks and legacy defaults', () => {
  assert.equal(defaultAIConfig.repeat_minutes,1440)
  assert.equal(defaultAIConfig.initial_delay_minutes,60)
  for (const initial_delay_minutes of [0,1,10,43200]) {
    for (const repeat_minutes of [1,10,59,1440,1501,43200]) {
      const c = {...defaultAIConfig, initial_delay_minutes, repeat_minutes, start:'09:17', end:'18:23'}
      assert.equal(validAISchedule(c),true)
      assert.deepEqual(validateAIConfig(c),c)
    }
  }
  for (const patch of [
    ...[-1,NaN,Infinity,0.5,43201].map(initial_delay_minutes=>({initial_delay_minutes})),
    ...[0,-1,NaN,Infinity,0.5,43201].map(repeat_minutes=>({repeat_minutes})),
    {start:''},{end:''},{start:'9:17'},{start:'09:60'},{end:'24:00'},
    {start:'18:23',end:'18:23'}, {start:'18:23',end:'09:17'}, {days:[]},
  ]) {
    const c = {...defaultAIConfig,...patch}
    assert.equal(validAISchedule(c),false,JSON.stringify(patch))
    assert.throws(()=>validateAIConfig(c))
  }
  const c = {...defaultAIConfig,repeat_minutes:10,start:'09:17',end:'18:23'}
  assert.equal(nextSendAt(new Date('2026-09-29T13:16:00Z'),c).toISOString(),'2026-09-29T13:17:00.000Z')
  assert.equal(nextSendAt(new Date('2026-09-29T22:23:00Z'),c).toISOString(),'2026-09-30T13:17:00.000Z')
})

test('config AI fails closed and scheduling uses local weekdays across DST', () => {
  assert.deepEqual(validateAIConfig(config), { ...config, model: 'gpt-4o-mini', presentation: '' })
  for (const patch of [{ repeat_minutes: 0 }, { days: [] }, { timezone: 'bad' }, { start: '19:00' }, { booking_url: 'http://localhost/a' }, { booking_url: 'https://calendly.com/\nPreço garantido' }, { goal: 'sale' }]) assert.throws(() => validateAIConfig({ ...config, ...patch }))
  assert.equal(nextSendAt(new Date('2026-03-06T23:00:00Z'), config).toISOString(), '2026-03-09T13:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-10-30T23:00:00Z'), config).toISOString(), '2026-11-02T14:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-03-09T13:00:31Z'), config).toISOString(), '2026-03-09T13:00:31.000Z')
})
