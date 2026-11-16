import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('SMS inbox SQL: real ownership, read isolation, snapshot, permissions and idempotence', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE buyers(id uuid PRIMARY KEY, auth_user_id uuid);
    CREATE TABLE team_members(id uuid PRIMARY KEY, auth_user_id uuid);
    CREATE TABLE leads(id uuid PRIMARY KEY, assigned_to uuid, assigned_to_member uuid);
    CREATE TABLE sms_messages(id uuid PRIMARY KEY, lead_id uuid REFERENCES leads(id), direction text, body text, status text, created_at timestamptz DEFAULT now());
    INSERT INTO buyers VALUES ('${id(1)}','${id(101)}'),('${id(2)}','${id(102)}'),('${id(3)}','${id(103)}');
    INSERT INTO team_members VALUES ('${id(201)}','${id(102)}'),('${id(202)}',NULL);
    INSERT INTO leads VALUES ('${id(301)}','${id(1)}','${id(201)}'),('${id(302)}','${id(1)}','${id(202)}'),('${id(303)}',NULL,'${id(201)}'),('${id(304)}',NULL,NULL);
    INSERT INTO sms_messages(id,lead_id,direction,body,status) VALUES
      ('${id(401)}','${id(301)}','in','reply','received'),
      ('${id(402)}','${id(302)}','in','fallback','received'),
      ('${id(403)}','${id(303)}','in','member only','received'),
      ('${id(404)}','${id(304)}','in','orphan','received'),
      ('${id(405)}','${id(301)}','out','sent','sent'),
      ('${id(406)}','${id(301)}','out','future','scheduled'),
      ('${id(407)}','${id(301)}','in','   ','received');
  `)
  const migration = readFileSync('supabase/migrations/078_sms_inbox_read.sql', 'utf8')
  await db.exec(migration); await db.exec(migration)
  const read = async (buyer: number, lead: number | null = null, admin = false, unread = false) => (await db.query<{id: string}>(
    'SELECT id FROM read_sms_inbox($1,$2,$3,$4)', [id(buyer), lead ? id(lead) : null, admin, unread],
  )).rows.map(r => r.id)
  const mark = async (buyer: number, lead: number | null, ids: string[] | null = null, admin = false) => (await db.query<{n: number}>(
    'SELECT mark_sms_inbox_read($1,$2,$3,$4) AS n', [id(buyer), lead ? id(lead) : null, admin, ids],
  )).rows[0].n
  assert.deepEqual(await read(1), [id(402)], 'agency must not receive member replies')
  assert.deepEqual(await read(2), [id(401),id(403),id(405)], 'member receives member-only leads too; no scheduled/empty')
  assert.deepEqual(await read(3), [], 'stranger has no inbox')
  assert.deepEqual(await read(1,301), [], 'old agency cannot access by lead_id')
  assert.deepEqual(await read(3,301,true), [id(401),id(405)], 'admin requires explicit lead scope')
  assert.deepEqual(await read(3,null,true), [], 'admin flag does not mean unrestricted buyer-wide read')
  assert.equal(await mark(1,301), 0)
  assert.equal(await mark(3,301,[id(401)]), 0)
  assert.equal(await mark(2,301,[]), 0, 'empty displayed snapshot marks nothing')
  assert.equal(await mark(2,301,[id(401),id(402),id(405)]), 1, 'IDs cannot cross owner/lead or mark outbound')
  assert.equal(await mark(2,301,[id(401)]), 0, 'read is idempotent')
  assert.deepEqual(await read(2,null,false,true), [id(403)])
  await db.exec(`INSERT INTO sms_messages(id,lead_id,direction,body,status) VALUES ('${id(408)}','${id(301)}','in','arrived later','received')`)
  assert.equal(await mark(2,301,[id(401)]), 0)
  assert.deepEqual(await read(2,301,false,true), [id(408)], 'arrival after snapshot stays unread')
  await db.exec(`UPDATE leads SET assigned_to_member=NULL, assigned_to='${id(3)}' WHERE id='${id(301)}'`)
  assert.deepEqual(await read(2,301), [], 'reassignment revokes SMS access')
  assert.equal(await mark(2,301,[id(408)]), 0, 'reassignment revokes write')
  assert.deepEqual(await read(3,301,false,true), [id(408)])
  assert.equal(await mark(3,301,[id(408)]), 1)
  assert.equal(await mark(3,304,null,true), 1, 'admin can mark explicit orphan lead')
  for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`)
    await assert.rejects(read(2), /permission denied/)
    await assert.rejects(mark(2,303), /permission denied/)
    await db.exec('RESET ROLE')
  }
  await db.exec('SET ROLE service_role')
  assert.deepEqual(await read(1), [id(402)])
  await db.exec('RESET ROLE')
  // Scalar duplicate auth mapping fails closed rather than choosing an arbitrary buyer.
  await db.exec(`INSERT INTO buyers VALUES ('${id(4)}','${id(102)}')`)
  await assert.rejects(read(2), /more than one row/)
})

test('SMS SQL keyset walks more than a server page without duplicate rows', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE buyers(id uuid, auth_user_id uuid); CREATE TABLE team_members(id uuid, auth_user_id uuid);
    CREATE TABLE leads(id uuid, assigned_to uuid, assigned_to_member uuid);
    CREATE TABLE sms_messages(id uuid, lead_id uuid, direction text, body text, status text);
    INSERT INTO leads VALUES ('${id(301)}','${id(1)}',NULL);
    INSERT INTO sms_messages SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'${id(301)}','in','reply','received' FROM generate_series(1,1203) n;`)
  await db.exec(readFileSync('supabase/migrations/078_sms_inbox_read.sql','utf8'))
  let cursor: string | null = null; const ids: string[] = []; const sizes: number[] = []
  for (;;) {
    const { rows }: { rows: { id: string }[] } = await db.query('SELECT id FROM read_sms_inbox($1,NULL,false,true,$2)',[id(1),cursor])
    sizes.push(rows.length); if (!rows.length) break
    ids.push(...rows.map(r => r.id)); cursor = rows[rows.length-1].id
  }
  assert.deepEqual(sizes,[500,500,203,0]); assert.equal(ids.length,1203); assert.equal(new Set(ids).size,1203)
})
