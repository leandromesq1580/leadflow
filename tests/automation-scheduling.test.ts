import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('production schedules Meta capture and the periodic automation runner', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(config.crons.some(cron => cron.path === '/api/poll-leads'))
  assert.ok(config.crons.some(cron => cron.path === '/api/cron/run-all'))
})

test('lead distribution triggers automations immediately after pipeline placement', () => {
  const source = readFileSync(new URL('../src/lib/distribute.ts', import.meta.url), 'utf8')
  assert.match(source, /import \{ runAutomations \} from '\.\/automation-engine'/)
  assert.match(source, /await runBuyerAutomations\(buyer\.id\)/)
  assert.match(source, /await runBuyerAutomations\(selectedBuyer\.id\)/)
})
