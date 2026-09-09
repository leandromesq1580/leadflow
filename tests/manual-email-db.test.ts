import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('manual email migration: persistent deduplication, atomic quotas and service-only access', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE buyers (id uuid PRIMARY KEY);')
    const migration = readFileSync(new URL('../supabase/migrations/048_manual_lead_email.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const owner = randomUUID(), other = randomUUID(), key = randomUUID()
    await db.query('INSERT INTO buyers VALUES ($1), ($2)', [owner, other])
    const reserve = async (buyer: string, request: string, hash: string, count = 20) =>
      (await db.query<{ result: { fresh?: boolean; limited?: boolean; id: string; payload_hash: string } }>('SELECT reserve_manual_email($1,$2,$3,$4) AS result', [buyer, request, hash.repeat(64).slice(0, 64), count])).rows[0].result
    const first = await reserve(owner, key, 'a')
    assert.equal(first.fresh, true)
    const repeat = await reserve(owner, key, 'a')
    assert.equal(repeat.fresh, false)
    assert.equal(repeat.id, first.id)
    assert.equal((await reserve(owner, key, 'b')).payload_hash, 'a'.repeat(64))
    assert.equal((await reserve(owner, randomUUID(), 'a')).id, first.id, 'new browser key cannot duplicate same copy within 24h')
    assert.equal((await reserve(owner, randomUUID(), 'b')).limited, true)
    assert.equal((await reserve(other, randomUUID(), 'b')).fresh, true)
    for (const hash of ['b', 'c', 'd', 'e']) {
      await db.query("UPDATE manual_email_batches SET created_at = now() - interval '2 minutes' WHERE buyer_id = $1", [owner])
      assert.equal((await reserve(owner, randomUUID(), hash)).fresh, true)
    }
    await db.query("UPDATE manual_email_batches SET created_at = now() - interval '2 minutes' WHERE buyer_id = $1", [owner])
    assert.equal((await reserve(owner, randomUUID(), 'f', 1)).limited, true)
    await assert.rejects(reserve(other, randomUUID(), 'c', 21))
    await db.query('INSERT INTO manual_email_preferences (buyer_id,email,suppressed_at) VALUES ($1,$3,now()), ($2,$3,NULL)', [owner, other, 'maria@example.invalid'])
    await db.query('INSERT INTO manual_email_preferences (buyer_id,email) VALUES ($1,$2) ON CONFLICT (buyer_id,email) DO NOTHING', [owner, 'maria@example.invalid'])
    assert.deepEqual((await db.query('SELECT suppressed_at IS NOT NULL AS suppressed FROM manual_email_preferences WHERE buyer_id=$1', [owner])).rows, [{ suppressed: true }])
    assert.deepEqual((await db.query('SELECT suppressed_at IS NOT NULL AS suppressed FROM manual_email_preferences WHERE buyer_id=$1', [other])).rows, [{ suppressed: false }])
    const tokens = (await db.query<{ token: string }>('SELECT token FROM manual_email_preferences')).rows
    assert.equal(new Set(tokens.map(row => row.token)).size, 2)
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.query('SELECT * FROM manual_email_preferences'))
    await assert.rejects(reserve(owner, randomUUID(), 'a'))
    await db.exec('RESET ROLE')
    for (const role of ['anon', 'authenticated']) {
      const rights = await db.query('SELECT has_function_privilege($1, $2, $3) AS allowed', [role, 'reserve_manual_email(uuid,uuid,text,integer)', 'EXECUTE'])
      assert.deepEqual(rights.rows, [{ allowed: false }])
      for (const table of ['manual_email_batches', 'manual_email_preferences']) {
        assert.deepEqual((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, table, 'SELECT, INSERT, UPDATE, DELETE'])).rows, [{ allowed: false }])
      }
    }
    assert.deepEqual((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('manual_email_batches','manual_email_preferences')")).rows, [{ relrowsecurity: true }, { relrowsecurity: true }])
  } finally { await db.close() }
})
