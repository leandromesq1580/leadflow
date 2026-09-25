import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buyerTimezone, isAvailableNow, type AvailabilityRow } from '../src/lib/availability'

// Real PostgreSQL engine (WASM), no mock RPC. PGlite has one session: this proves
// DB-side revalidation, NOT multi-connection lock contention/deadlock behavior.
const buyer = '00000000-0000-0000-0000-000000000001'
const migration = new URL('../supabase/migrations/049_priority_only_atomic_delivery.sql', import.meta.url)
async function setup() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE settings (key text PRIMARY KEY, value jsonb);
    CREATE TABLE buyers (id uuid PRIMARY KEY, name text, email text, phone text,
      notification_email boolean, notification_sms boolean, is_active boolean DEFAULT true,
      whatsapp text, notification_phone_2 text, cal_link text, is_agency boolean,
      team_distribution_mode text, updated_at timestamptz);
    CREATE TABLE buyer_states (buyer_id uuid REFERENCES buyers(id), state_code text, UNIQUE(buyer_id,state_code));
    CREATE TABLE buyer_availability (buyer_id uuid REFERENCES buyers(id),
      day_type text NOT NULL CHECK(day_type IN ('weekday','saturday','sunday','holiday')),
      period text NOT NULL CHECK(period IN ('morning','afternoon','evening')),
      hours smallint[], UNIQUE(buyer_id,day_type,period));
    CREATE TABLE credits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid,
      type text DEFAULT 'lead', lead_language text DEFAULT 'pt', total_purchased int DEFAULT 10,
      total_used int DEFAULT 0, expires_at timestamptz, purchased_at timestamptz DEFAULT now());
    CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meta_lead_id text DEFAULT 'synthetic',
      state text DEFAULT 'FL', product_type text DEFAULT 'lead', lead_language text DEFAULT 'pt',
      assigned_to uuid, assigned_at timestamptz, status text DEFAULT 'new', delivery_credit_id uuid,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    INSERT INTO buyers (id,email) VALUES ('${buyer}','priority@example.invalid');
    INSERT INTO buyer_states VALUES ('${buyer}','FL');
    INSERT INTO credits (buyer_id) VALUES ('${buyer}');
    INSERT INTO credits (buyer_id,lead_language) VALUES ('${buyer}','es');
    INSERT INTO settings VALUES ('lead_routing', '{"priority_only":true,"admin_rule":{"admin_emails":["priority@example.invalid"],"daily_max":1}}');
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/046_atomic_paid_lead_delivery.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/048_atomic_buyer_settings.sql', import.meta.url), 'utf8'))
  if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'))
  const insert = async (language = 'pt') => (await db.query<{ id: string }>('INSERT INTO leads (lead_language) VALUES ($1) RETURNING id', [language])).rows[0].id
  const assign = async (id: string, language = 'pt') => (await db.query<{ credit: string | null }>('SELECT assign_paid_lead_with_credit($1,$2,$3) AS credit', [id, buyer, language])).rows[0].credit
  return { db, insert, assign }
}

test('SQL availability matches TypeScript for zones, DST, hourly boundaries, no rows and legacy periods', async () => {
  const { db } = await setup()
  try {
    const stateSets = 'CT DE FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV DC AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI AZ CO ID MT NM UT WY CA NV OR WA AK HI'.split(' ').map(s => [s])
    stateSets.push([], ['XX'], ['CA', 'FL'], ['CA', 'NV', 'FL'], ['TX', 'CO'], ['AZ', 'CA'], ['fl'])
    const configs: AvailabilityRow[][] = [[],
      [{ day_type: 'weekday', period: 'morning', hours: null }],
      [{ day_type: 'weekday', period: 'morning', hours: [] }],
      [{ day_type: 'weekday', period: 'morning', hours: [8, 10] }],
      [{ day_type: 'weekday', period: 'afternoon', hours: [12, 17] }],
      [{ day_type: 'weekday', period: 'evening', hours: [] }],
      [{ day_type: 'saturday', period: 'morning', hours: [8, 11] }],
      [{ day_type: 'sunday', period: 'morning', hours: null }, { day_type: 'sunday', period: 'evening', hours: [20] }],
      [{ day_type: 'holiday', period: 'morning', hours: [] }],
    ]
    // UTC hourly sweeps cover midnight and each local interval in every zone.
    // Spring/fall transition Sundays, adjacent Saturdays, summer/winter weekdays.
    const times = ['2026-01-12', '2026-07-13', '2026-03-07', '2026-03-08', '2026-10-31', '2026-11-01']
      .flatMap(day => Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, '0')}:00:00Z`))
    times.push('2026-07-13T11:59:59Z', '2026-07-13T15:59:59Z', '2026-07-13T21:59:59Z', '2026-07-14T00:59:59Z')
    for (const states of stateSets) {
      await db.query('DELETE FROM buyer_states WHERE buyer_id=$1', [buyer])
      for (const state of states) await db.query('INSERT INTO buyer_states VALUES ($1,$2)', [buyer, state])
      for (const rows of configs) {
        await db.query('SELECT save_buyer_settings($1,$2,$3,$4)', [buyer, '{}', null, JSON.stringify(rows)])
        const results = await db.query<{ available: boolean }>(
          'SELECT automatic_buyer_available($1, t) AS available FROM unnest($2::timestamptz[]) WITH ORDINALITY AS instants(t,n) ORDER BY n', [buyer, times])
        assert.deepEqual(results.rows.map(r => r.available), times.map(t => isAvailableNow(rows, buyerTimezone(states), new Date(t))), JSON.stringify({ states, rows }))
      }
    }
  } finally { await db.close() }
})

test('SQL rejects availability saved by 048 between application snapshot and assignment', async () => {
  const { db, insert, assign } = await setup()
  try {
    const snapshot = (await db.query<AvailabilityRow>('SELECT day_type,period,hours FROM buyer_availability')).rows
    assert.equal(isAvailableNow(snapshot, buyerTimezone(['FL'])), true)
    // Holiday never maps to a real weekday in availability.ts: deterministic
    // outside-window configuration, even if this test runs across midnight.
    const windows = [{ day_type: 'holiday', period: 'morning', hours: [] }]
    await db.query('SELECT save_buyer_settings($1,$2,$3,$4)', [buyer, '{}', null, JSON.stringify(windows)])
    assert.equal(isAvailableNow(windows, buyerTimezone(['FL'])), false)
    const id = await insert()
    assert.equal(await assign(id), null)
    assert.deepEqual((await db.query('SELECT assigned_to,status,delivery_credit_id FROM leads WHERE id=$1', [id])).rows,
      [{ assigned_to: null, status: 'new', delivery_credit_id: null }])
    assert.deepEqual((await db.query('SELECT sum(total_used)::int AS used FROM credits')).rows, [{ used: 0 }])
    await db.exec(`UPDATE settings SET value=jsonb_set(value,'{priority_only}','false')`)
    assert.ok(await assign(id), 'OFF keeps the existing paid RPC contract')
  } finally { await db.close() }
})

test('SQL free assignment refuses ON including selected staff, preserves free OFF and non-system paths', async () => {
  const { db, insert } = await setup()
  const free = async (id: string) => (await db.query<{ assigned: boolean }>('SELECT assign_automatic_free_lead($1,$2) AS assigned', [id, buyer])).rows[0].assigned
  try {
    await db.exec('DELETE FROM credits') // fallback must not require credit with OFF
    for (const selected of [[], ['priority@example.invalid']]) {
      await db.query(`UPDATE settings SET value=jsonb_set(value,'{priority_only}','false')`)
      const snapshot = (await db.query<{ value: { priority_only: boolean } }>('SELECT value FROM settings')).rows[0].value
      assert.equal(snapshot.priority_only, false)
      const id = await insert()
      await db.query(`UPDATE settings SET value=jsonb_set(jsonb_set(value,'{priority_only}','true'),'{admin_rule,admin_emails}',$1)`, [JSON.stringify(selected)])
      assert.equal(await free(id), false)
      assert.deepEqual((await db.query('SELECT assigned_to,status,delivery_credit_id FROM leads WHERE id=$1', [id])).rows,
        [{ assigned_to: null, status: 'new', delivery_credit_id: null }])
    }
    await db.exec(`UPDATE settings SET value=jsonb_set(value,'{priority_only}','false')`)
    const off = await insert()
    assert.equal(await free(off), true)
    assert.equal(await free(off), false, 'no second assignment or notification on retry')
    await db.exec(`UPDATE settings SET value=jsonb_set(value,'{priority_only}','true')`)
    const manual = await insert()
    await db.query('UPDATE leads SET meta_lead_id=NULL WHERE id=$1', [manual])
    assert.equal(await free(manual), true)
    assert.deepEqual((await db.query('SELECT delivery_credit_id FROM leads WHERE assigned_to IS NOT NULL')).rows,
      [{ delivery_credit_id: null }, { delivery_credit_id: null }])
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query<{ allowed: boolean }>("SELECT has_function_privilege($1,'assign_automatic_free_lead(uuid,uuid)','EXECUTE') AS allowed", [role])).rows[0].allowed, role === 'service_role')
    }
  } finally { await db.close() }
})

test('SQL refuses missing state or license in ONLY, never inferring a license', async () => {
  const { db, insert, assign } = await setup()
  try {
    for (const state of ['', null, 'NY']) {
      const id = await insert()
      await db.query('UPDATE leads SET state=$1 WHERE id=$2', [state, id])
      assert.equal(await assign(id), null)
    }
    await db.exec('DELETE FROM buyer_states')
    assert.equal(await assign(await insert()), null)
    assert.deepEqual((await db.query('SELECT sum(total_used)::int AS used FROM credits')).rows, [{ used: 0 }])
  } finally { await db.close() }
})

test('SQL rereads saved selection, cap and activity rather than trusting a caller snapshot; OFF stays unchanged', async () => {
  const { db, insert, assign } = await setup()
  try {
    for (const change of [
      `UPDATE settings SET value = jsonb_set(value, '{admin_rule,admin_emails}', '[]')`,
      `UPDATE settings SET value = jsonb_set(value, '{admin_rule,daily_max}', '0')`,
      `UPDATE buyers SET is_active = false`,
    ]) {
      await db.exec(`UPDATE settings SET value = '{"priority_only":true,"admin_rule":{"admin_emails":["priority@example.invalid"],"daily_max":1}}'; UPDATE buyers SET is_active = true;`)
      const id = await insert()
      await db.exec(change)
      assert.equal(await assign(id), null, change)
    }
    await db.exec(`UPDATE settings SET value = '{"priority_only":false,"admin_rule":{"admin_emails":[],"daily_max":0}}'; UPDATE buyers SET is_active = true;`)
    assert.ok(await assign(await insert()))
    assert.ok(await assign(await insert()))
    assert.deepEqual((await db.query("SELECT has_function_privilege('authenticated', 'assign_paid_lead_with_credit(uuid,uuid,text)', 'EXECUTE') AS allowed")).rows, [{ allowed: false }])
  } finally { await db.close() }
})

test('SQL cap counts only system assignments today and separates PT/ES; retries never debit twice', async () => {
  const { db, insert, assign } = await setup()
  try {
    await db.exec(`INSERT INTO leads (assigned_to,assigned_at,meta_lead_id) VALUES ('${buyer}',now(),NULL);
      INSERT INTO leads (assigned_to,assigned_at) VALUES ('${buyer}',(date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York') - interval '1 second');`)
    const pt = await insert()
    assert.ok(await assign(pt))
    assert.equal(await assign(pt), null)
    assert.equal(await assign(await insert()), null)
    assert.ok(await assign(await insert('es'), 'es'))
    assert.equal(await assign(await insert('es'), 'es'), null)
    assert.deepEqual((await db.query('SELECT lead_language, total_used FROM credits ORDER BY lead_language')).rows, [{ lead_language: 'es', total_used: 1 }, { lead_language: 'pt', total_used: 1 }])
  } finally { await db.close() }
})

test('SQL rechecks the daily cap on assignment, even when both callers saw zero', async () => {
  const { db, insert, assign } = await setup()
  try {
    const ids = await Promise.all([insert(), insert()])
    const results = await Promise.all(ids.map(id => assign(id)))
    assert.equal(results.filter(Boolean).length, 1)
    assert.deepEqual((await db.query('SELECT sum(total_used)::int AS used FROM credits')).rows, [{ used: 1 }])
    assert.deepEqual((await db.query('SELECT count(*)::int AS assigned FROM leads WHERE assigned_to IS NOT NULL')).rows, [{ assigned: 1 }])
  } finally { await db.close() }
})
