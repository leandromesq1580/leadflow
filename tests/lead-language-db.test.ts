import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('migration preserves BR balances; purchases and eligible buyers are isolated by language', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE buyers (id uuid primary key, name text, email text, phone text,
        notification_email boolean, notification_sms boolean, is_active boolean default true);
      CREATE TABLE buyer_states (buyer_id uuid, state_code text);
      CREATE TABLE credits (id uuid primary key default gen_random_uuid(), buyer_id uuid references buyers(id),
        type text, total_purchased integer CHECK (total_purchased < 1000), total_used integer,
        price_per_unit numeric, stripe_payment_id text, purchased_at timestamptz default now(), expires_at timestamptz);
      CREATE TABLE payments (id uuid primary key default gen_random_uuid(), buyer_id uuid references buyers(id),
        stripe_session_id text, stripe_payment_intent_id text, product_type text, quantity integer,
        price_per_unit numeric, amount numeric, status text);
      CREATE TABLE leads (id uuid primary key default gen_random_uuid(), assigned_to uuid,
        assigned_at timestamptz, delivery_credit_id uuid, form_name text, status text,
        created_at timestamptz default now(), updated_at timestamptz default now());
      INSERT INTO buyers (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Buyer');
      INSERT INTO buyer_states VALUES ('00000000-0000-0000-0000-000000000001', 'FL');
      INSERT INTO credits (buyer_id, type, total_purchased, total_used) VALUES ('00000000-0000-0000-0000-000000000001', 'lead', 3, 1);
      INSERT INTO leads (form_name, status) VALUES ('1963007337624994', 'new'), ('25952858404333766', 'new');
    `)
    await db.exec(readFileSync(new URL('../supabase/migrations/044_lead_purchase_language.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../supabase/migrations/046_atomic_paid_lead_delivery.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await db.query('select lead_language, total_purchased, total_used from credits')).rows, [{ lead_language: 'pt', total_purchased: 3, total_used: 1 }])
    assert.deepEqual((await db.query('select lead_language from leads order by lead_language')).rows, [{ lead_language: 'es' }, { lead_language: 'pt' }])
    const fulfill = (id: string, language: string, type = 'lead', quantity = 10) => db.query('select fulfill_lead_purchase($1,$2,$3,$4,$5,$6,$7,$8) as fulfilled', ['00000000-0000-0000-0000-000000000001', id, `pi_${id}`, type, language, quantity, 28, 280])
    assert.deepEqual((await fulfill('es', 'es')).rows, [{ fulfilled: true }])
    assert.deepEqual((await fulfill('es', 'es')).rows, [{ fulfilled: false }])
    await fulfill('pt', 'pt')
    assert.equal((await db.query('select * from credits')).rows.length, 3)
    assert.equal((await db.query('select * from payments')).rows.length, 2)
    const eligible = (language: string, state = 'FL') => db.query('select remaining from get_eligible_buyers_by_language($1,$2,$3)', ['lead', state, language])
    assert.deepEqual((await eligible('es')).rows, [{ remaining: 10 }])
    assert.deepEqual((await eligible('pt')).rows, [{ remaining: 12 }])
    assert.equal((await eligible('es', 'NY')).rows.length, 0)

    // Regression: the 28-credit delivery debt must offset new purchases instead
    // of exposing each new positive credit row independently.
    await db.exec("update credits set total_used = 31 where lead_language = 'pt' and stripe_payment_id is null")
    assert.equal((await eligible('pt')).rows.length, 0)
    await fulfill('pt-debt-payment', 'pt', 'lead', 25)
    assert.deepEqual((await eligible('pt')).rows, [{ remaining: 7 }])

    const leadId = (await db.query<{ id: string }>("insert into leads (status, lead_language) values ('new', 'pt') returning id")).rows[0].id
    const assigned = await db.query<{ credit_id: string | null }>(
      'select assign_paid_lead_with_credit($1,$2,$3) as credit_id',
      [leadId, '00000000-0000-0000-0000-000000000001', 'pt'],
    )
    assert.ok(assigned.rows[0].credit_id)
    assert.deepEqual((await db.query('select assigned_to, status, delivery_credit_id is not null as debited from leads where id = $1', [leadId])).rows,
      [{ assigned_to: '00000000-0000-0000-0000-000000000001', status: 'assigned', debited: true }])
    assert.deepEqual((await eligible('pt')).rows, [{ remaining: 6 }])
    assert.deepEqual((await db.query('select assign_paid_lead_with_credit($1,$2,$3) as credit_id', [leadId, '00000000-0000-0000-0000-000000000001', 'pt'])).rows,
      [{ credit_id: null }])
    await db.exec("update credits set expires_at = now() - interval '1 day' where lead_language = 'es'")
    assert.equal((await eligible('es')).rows.length, 0)
    await db.exec("update buyers set is_active = false")
    assert.equal((await eligible('pt')).rows.length, 0)
    await fulfill('cold-es', 'es', 'cold_lead', 25)
    assert.equal((await db.query('select * from credits')).rows.length, 4)
    assert.deepEqual((await db.query("select lead_language from payments where stripe_session_id = 'cold-es'")).rows, [{ lead_language: 'es' }])
    await assert.rejects(fulfill('bad-language', 'en'))
    await assert.rejects(fulfill('credit-fails', 'es', 'lead', 1001))
    assert.equal((await db.query("select * from payments where stripe_session_id in ('bad-language','credit-fails')")).rows.length, 0)
    const rights = await db.query("select has_function_privilege('authenticated', 'fulfill_lead_purchase(uuid,text,text,text,text,integer,numeric,numeric)', 'EXECUTE') as allowed")
    assert.deepEqual(rights.rows, [{ allowed: false }])
    const deliveryRights = await db.query("select has_function_privilege('authenticated', 'assign_paid_lead_with_credit(uuid,uuid,text)', 'EXECUTE') as allowed")
    assert.deepEqual(deliveryRights.rows, [{ allowed: false }])
  } finally { await db.close() }
})
