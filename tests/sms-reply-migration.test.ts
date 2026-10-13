import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { acknowledgeConversation } from '../src/lib/conversation-read-receipt'

test('real PostgreSQL migration: owner isolation, member fallback, transfer, receipts and permissions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE buyers (id uuid PRIMARY KEY, auth_user_id uuid UNIQUE);
      CREATE TABLE team_members (id uuid PRIMARY KEY, auth_user_id uuid);
      CREATE TABLE leads (id uuid PRIMARY KEY, assigned_to uuid, assigned_to_member uuid);
      CREATE TABLE sms_messages (id uuid PRIMARY KEY, lead_id uuid, direction text, body text, created_at timestamptz);
      INSERT INTO buyers VALUES ('00000000-0000-4000-8000-000000000001', null), ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012');
      INSERT INTO team_members VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000012');
      INSERT INTO leads VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',null);
      INSERT INTO sms_messages VALUES ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004','in','Fixture',now());`)
    const migration = readFileSync('supabase/migrations/067_sms_reply_unread.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const owner = async () => (await db.query<{buyer_id: string}>('SELECT buyer_id FROM sms_inbox_messages')).rows[0].buyer_id
    assert.equal(await owner(), '00000000-0000-4000-8000-000000000001')
    await db.exec("UPDATE leads SET assigned_to_member='00000000-0000-4000-8000-000000000003'")
    assert.equal(await owner(), '00000000-0000-4000-8000-000000000002')
    await db.exec('UPDATE team_members SET auth_user_id=null')
    assert.equal(await owner(), '00000000-0000-4000-8000-000000000001')
    assert.equal((await db.query('SELECT * FROM sms_inbox_messages WHERE read_at IS NULL')).rows.length, 1)
    await db.exec('UPDATE sms_messages SET read_at=now()')
    assert.equal((await db.query('SELECT * FROM sms_inbox_messages WHERE read_at IS NULL')).rows.length, 0)
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query<{allowed: boolean}>(`SELECT has_table_privilege('${role}', 'sms_inbox_messages', 'SELECT') AS allowed`)).rows[0].allowed, false)
    }
    assert.equal((await db.query<{allowed: boolean}>("SELECT has_table_privilege('service_role', 'sms_inbox_messages', 'SELECT') AS allowed")).rows[0].allowed, true)
  } finally { await db.close() }
})

test('rendered sms- IDs become receipts, only inbound unread, chunked; failed receipt stays unread', async () => {
  const original = globalThis.fetch
  const bodies: { sms_ids: string[] }[] = []
  globalThis.fetch = async (_u, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }) }
  try {
    const messages = Array.from({ length: 201 }, (_, i) => ({ id: `sms-${String(i).padStart(8,'0')}-0000-4000-8000-000000000001`, direction: 'in', channel: 'sms' }))
    assert.equal(await acknowledgeConversation('lead', [...messages, {id:'sms-out',direction:'out',channel:'sms'}, {id:'wa',direction:'in',channel:'whatsapp'}, {id:'sms-read',direction:'in',channel:'sms',read_at:'date'}]), true)
    assert.deepEqual(bodies.map(b => b.sms_ids.length), [200, 1])
    assert.equal(bodies[0].sms_ids[0], '00000000-0000-4000-8000-000000000001')
    globalThis.fetch = async () => Response.json({}, { status: 503 })
    assert.equal(await acknowledgeConversation('lead', messages), false)
  } finally { globalThis.fetch = original }
})
