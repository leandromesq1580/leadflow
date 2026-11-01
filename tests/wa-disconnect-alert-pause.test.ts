import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWaDisconnectAlertPaused } from '../src/lib/wa-alert-pause'

const now = new Date('2026-11-01T21:30:00Z')

test('sem configuração, o aviso de queda de WhatsApp continua ligado', () => {
  for (const v of [null, undefined, {}, 'x', 5, { until: null }, { until: 'lixo' }]) {
    assert.equal(isWaDisconnectAlertPaused(v, now), false)
  }
})
test('pausa vale até o horário e expira sozinha', () => {
  assert.equal(isWaDisconnectAlertPaused({ until: '2026-11-03T21:30:00Z' }, now), true)
  assert.equal(isWaDisconnectAlertPaused({ until: '2026-11-01T21:30:00Z' }, now), false)
  assert.equal(isWaDisconnectAlertPaused({ until: '2026-11-01T10:00:00Z' }, now), false)
})
