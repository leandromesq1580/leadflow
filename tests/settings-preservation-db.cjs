/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness; no application imports or credentials. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { PGlite } = require('@electric-sql/pglite')
const fs = require('node:fs')
const path = require('node:path')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
test('real SQL preserves omitted fields, rolls back failed replacement and isolates buyers', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE buyers(id uuid PRIMARY KEY, name text, phone text, whatsapp text, notification_phone_2 text, cal_link text,
        notification_email boolean, notification_sms boolean, is_agency boolean, team_distribution_mode text, updated_at timestamptz);
      CREATE TABLE buyer_states(buyer_id uuid REFERENCES buyers(id), state_code text NOT NULL, UNIQUE(buyer_id,state_code));
      CREATE TABLE buyer_availability(buyer_id uuid REFERENCES buyers(id), day_type text NOT NULL CHECK(day_type IN ('weekday','saturday','sunday','holiday')),
        period text NOT NULL CHECK(period IN ('morning','afternoon','evening')), hours smallint[], UNIQUE(buyer_id,day_type,period));
      INSERT INTO buyers(id,name) VALUES ('${A}','A'),('${B}','B');
      INSERT INTO buyer_states VALUES ('${A}','FL'),('${B}','NY');
      INSERT INTO buyer_availability VALUES ('${A}','weekday','morning',ARRAY[8,9]);
    `)
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/048_atomic_buyer_settings.sql'), 'utf8')
    await db.exec(sql)
    const save = (profile, states, availability) => db.query('select public.save_buyer_settings($1::uuid,$2::jsonb,$3::text[],$4::jsonb)', [A, JSON.stringify(profile), states, availability === null ? null : JSON.stringify(availability)])
    const state = async () => ({
      buyers: (await db.query('select id,name,team_distribution_mode from buyers order by id')).rows,
      states: (await db.query('select * from buyer_states order by buyer_id,state_code')).rows,
      availability: (await db.query('select * from buyer_availability order by buyer_id')).rows,
    })
    await save({ team_distribution_mode: 'manual' }, null, null)
    const before = await state()
    assert.equal(before.states.length, 2)
    assert.equal(before.availability.length, 1)
    // Simulate an insertion failure AFTER deletes: the complete call must roll back.
    await db.exec(`CREATE FUNCTION fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected insert failure'; END$$;
      CREATE TRIGGER test_failure BEFORE INSERT ON buyer_availability FOR EACH ROW EXECUTE FUNCTION fail_insert();`)
    await assert.rejects(save({ name: 'changed' }, ['TX'], [{ day_type: 'sunday', period: 'evening', hours: null }]), /injected insert failure/)
    assert.deepEqual(await state(), before)
    await db.exec('DROP TRIGGER test_failure ON buyer_availability')
    await save({}, ['TX','TX','FL'], null)
    assert.deepEqual((await state()).states, [{ buyer_id: A, state_code: 'FL' }, { buyer_id: A, state_code: 'TX' }, { buyer_id: B, state_code: 'NY' }])
    assert.deepEqual((await state()).availability, before.availability)
    await save({}, null, [])
    assert.deepEqual((await state()).availability, [])
    assert.equal((await state()).states.length, 3)
    await save({}, [], null)
    assert.deepEqual((await state()).states, [{ buyer_id: B, state_code: 'NY' }])
    for (const role of ['anon', 'authenticated']) {
      const check = await db.query("select has_function_privilege($1, 'public.save_buyer_settings(uuid,jsonb,text[],jsonb)', 'EXECUTE') as allowed", [role])
      assert.equal(check.rows[0].allowed, false)
    }
    assert.equal((await db.query("select has_function_privilege('service_role','public.save_buyer_settings(uuid,jsonb,text[],jsonb)','EXECUTE') as allowed")).rows[0].allowed, true)
  } finally { await db.close() }
})
