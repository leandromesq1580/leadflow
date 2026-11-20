import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('atomic recruitment: ownership, attribution, replay, conflicts, abuse and rollback', async () => {
 const db = new PGlite()
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE buyers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
   CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, email text, phone text, interest text, campaign_name text, form_name text, type text, status text, product_type text, assigned_to uuid, assigned_at timestamptz, raw_data jsonb, created_at timestamptz DEFAULT now());
   CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES leads, buyer_id uuid REFERENCES buyers, scheduled_at timestamptz, status text, qualification_notes text);
   CREATE TABLE pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid, is_default boolean);
   CREATE TABLE pipeline_stages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid, position int);
   CREATE TABLE pipeline_leads(lead_id uuid REFERENCES leads, pipeline_id uuid, stage_id uuid, position int, moved_at timestamptz);
   CREATE TABLE follow_ups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES leads, buyer_id uuid, type text, description text, scheduled_at timestamptz);
   INSERT INTO buyers(email) VALUES ('regiane@myhomefirst.us');
   INSERT INTO pipelines(buyer_id,is_default) SELECT id,true FROM buyers;
   INSERT INTO pipeline_stages(pipeline_id,position) SELECT id,0 FROM pipelines;`)
  await db.exec(readFileSync('supabase/migrations/079_equipe_booking.sql','utf8'))
  const slotResult = await db.query<{slot:string}>(`SELECT (date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo') + interval '7 days 9 hours') AT TIME ZONE 'America/Sao_Paulo' AS slot`)
  const slot = new Date(slotResult.rows[0].slot).toISOString()
  const body = {nome:'Jane',email:'jane@example.test',telefone:'+12025550123',idioma:'en',fuso:'America/New_York',slot,requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9',tracking:{utm_campaign:'agents'}}
  const book = (b=body, ip='hash-ip') => db.query<{result:{ok:boolean}}>('SELECT public.equipe_book($1::jsonb,$2::text) AS result',[JSON.stringify(b),ip])
  assert.equal((await book()).rows[0].result.ok,true)
  assert.equal((await book()).rows[0].result.ok,true)
  const rows = await db.query<{source:string;email:string;campaign:string}>(`SELECT l.raw_data->>'source' AS source,b.email,l.campaign_name AS campaign FROM leads l JOIN buyers b ON b.id=l.assigned_to`)
  assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].source,'landing_equipe'); assert.equal(rows.rows[0].email,'regiane@myhomefirst.us'); assert.match(rows.rows[0].campaign,/Recrutamento/)
  for(const table of ['appointments','pipeline_leads','follow_ups']) assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,1)
  assert.equal((await db.query<{scheduled_at:string|null}>('SELECT scheduled_at FROM follow_ups')).rows[0].scheduled_at,null)
  await assert.rejects(book({...body,requestId:'b97687f0-d792-4b27-bd06-1ee41ccf44b9',email:'other@example.test'}),/slot_taken/)
  // Writes by other paths (including nova) cannot overlap a recruitment booking.
  await assert.rejects(db.exec(`INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) SELECT l.id,b.id,'${slot}'::timestamptz+interval '15 minutes','scheduled' FROM leads l CROSS JOIN buyers b`),/slot_taken/)
  await assert.rejects(book({...body,requestId:'c97687f0-d792-4b27-bd06-1ee41ccf44b9',slot:new Date(Date.parse(slot)+3600000).toISOString()}),/rate_limited/)
  await db.exec('DELETE FROM pipeline_stages')
  await assert.rejects(book({...body,requestId:'d97687f0-d792-4b27-bd06-1ee41ccf44b9',email:'next@example.test',telefone:'+12025550124',slot:new Date(Date.parse(slot)+7200000).toISOString()},'next-ip'),/unavailable/)
  assert.equal((await db.query('SELECT * FROM leads')).rows.length,1)
  const privileges = await db.query<{allowed:boolean}>(`SELECT has_function_privilege('anon','public.equipe_book(jsonb,text)','EXECUTE') AS allowed`)
  assert.equal(privileges.rows[0].allowed,false)
 } finally { await db.close() }
})
