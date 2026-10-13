// Real local PostgreSQL CAS regression. Unix socket only, no production/provider.
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
const host = process.env.EC_TEST_SOCKET
if (!host?.startsWith('/')) throw new Error('Local Unix socket required')
const { Client } = createRequire((process.env.EC_TEST_TOOL_DIR || process.cwd()) + '/package.json')('pg')
const clients = []
async function connect(database = 'postgres') {
  const c = new Client({ host, port: 55432, user: process.env.USER || 'hermes', database, statement_timeout: 15000 })
  await c.connect(); clients.push(c); return c
}
const control = await connect()
const database = 'seq_window_' + randomUUID().replaceAll('-', '')
await control.query('CREATE DATABASE ' + database)
const db = await connect(database), concurrent = await connect(database), admin = await connect(database)
const results = []
try {
  await db.query('create table sequences(id uuid primary key,buyer_id uuid,mode text,enabled boolean,updated_at timestamptz,ai_config jsonb)')
  for (const field of ['ai_config', 'buyer_id', 'mode', 'enabled', 'updated_at']) {
    const id = randomUUID(), buyer = randomUUID()
    const config = { start: '09:00', end: '21:00', repeat_minutes: 480, instructions: 'synthetic', nested: { preserved: true } }
    await db.query("insert into sequences values($1,$2,'ai_until_reply',true,$3,$4)", [id, buyer, '2026-10-13T12:00:00Z', config])
    const snapshot = (await db.query('select * from sequences where id=$1', [id])).rows[0]
    await concurrent.query('begin')
    const changes = { ai_config: ['ai_config', { ...config, instructions: 'concurrent' }], buyer_id: ['buyer_id', randomUUID()],
      mode: ['mode', 'legacy'], enabled: ['enabled', false], updated_at: ['updated_at', '2026-10-13T13:00:00Z'] }
    const [column, value] = changes[field]
    // Column from the fixed allowlist above; all data parameterized.
    await concurrent.query('update sequences set ' + column + '=$2 where id=$1', [id, value])
    const update = admin.query(`update sequences set ai_config=$7,updated_at=now()
      where id=$1 and buyer_id=$2 and mode=$3 and enabled=$4 and updated_at=$5 and ai_config=$6 returning *`,
      [id, buyer, snapshot.mode, snapshot.enabled, snapshot.updated_at, snapshot.ai_config, { ...config, start: '08:00' }])
    let blocked = false
    try {
      for (let attempt = 0; attempt < 150; attempt++) {
        const locks = (await db.query('select pg_blocking_pids($1) blockers', [admin.processID])).rows[0].blockers
        if (locks.includes(concurrent.processID)) { blocked = true; break }
        await delay(10)
      }
      assert.ok(blocked, 'must observe row lock before concurrent commit')
    } finally { await concurrent.query('commit') }
    assert.equal((await update).rowCount, 0, 'stale admin update must affect zero rows')
    assert.equal((await db.query('select ai_config from sequences where id=$1', [id])).rows[0].ai_config.start, '09:00')
    results.push(field); console.log('PASS CAS rechecks committed ' + field + ' after waiting on row lock')
  }
  // JSONB object order differs from payload but compares equal; only window changes.
  const id = randomUUID(), buyer = randomUUID()
  const config = { start: '09:00', end: '21:00', repeat_minutes: 480, future: { b: 2, a: 1 } }
  await db.query("insert into sequences values($1,$2,'ai_until_reply',false,$3,$4)", [id, buyer, '2026-10-13T12:00:00Z', config])
  const snapshot = (await db.query('select * from sequences where id=$1', [id])).rows[0]
  const reordered = { future: { a: 1, b: 2 }, repeat_minutes: 480, end: '21:00', start: '09:00' }
  const result = await admin.query(`update sequences set ai_config=$7,updated_at=now()
    where id=$1 and buyer_id=$2 and mode=$3 and enabled=$4 and updated_at=$5 and ai_config=$6 returning *`,
    [id, buyer, snapshot.mode, snapshot.enabled, snapshot.updated_at, reordered, { ...config, start: '08:00' }])
  assert.equal(result.rowCount, 1); assert.equal(result.rows[0].enabled, false)
  assert.deepEqual(result.rows[0].ai_config, { ...config, start: '08:00' })
  results.push('jsonb-order'); console.log('PASS JSONB order-independent equality and complete field preservation')
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), source: 'real-local-postgresql', passed: results.length,
    database, provider_send_calls: 0, production_writes: 0 }))
} finally {
  for (const c of clients) { try { await c.query('rollback') } catch {} await c.end() }
}
