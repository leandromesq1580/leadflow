import { readFileSync, existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export function schemaSQL() {
  let sql = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
-- PostgreSQL built-in SHA256, not a fabricated digest; pgcrypto is absent in WASM.
CREATE FUNCTION digest(text,text) RETURNS bytea LANGUAGE SQL IMMUTABLE AS $$ SELECT sha256(convert_to($1,'UTF8')) $$;
CREATE TABLE buyers(id uuid primary key,auth_user_id uuid,name text,email text,phone text,is_admin boolean default false,is_active boolean default true);
CREATE TABLE team_members(id uuid primary key,buyer_id uuid,auth_user_id uuid,is_active boolean default true);
CREATE TABLE credits(id uuid primary key default gen_random_uuid(),buyer_id uuid references buyers(id),type text default 'lead',lead_language text default 'pt',total_purchased int default 0,total_used int default 0,purchased_at timestamptz default now(),expires_at timestamptz,stripe_payment_id text);
CREATE TABLE leads(id uuid primary key default gen_random_uuid(),name text,email text,phone text,phone_digits text generated always as (regexp_replace(phone,'[^0-9]','','g')) stored,city text,state text,interest text,lead_language text default 'pt',birth_date date,assigned_to uuid references buyers(id),assigned_to_member uuid,assigned_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),archived boolean default false,archived_at timestamptz,archived_by uuid references buyers(id),contract_closed boolean default false,sms_opted_out boolean default false,type text default 'hot',status text default 'new',product_type text default 'lead',campaign_name text,form_name text,meta_lead_id text unique,raw_data jsonb,notified_at timestamptz,closed_at timestamptz,ai_score int,ai_score_reason text);
CREATE TABLE templates(id uuid primary key,buyer_id uuid,is_system boolean,type text default 'whatsapp');
CREATE TABLE sms_messages(id uuid primary key default gen_random_uuid(),lead_id uuid,direction text,body text,from_phone text,to_phone text,twilio_sid text unique,status text,error text,scheduled_for timestamptz,created_at timestamptz default now());
CREATE TABLE policy_acceptances(id uuid primary key);
CREATE TABLE payments(id uuid primary key,buyer_id uuid,stripe_session_id text,stripe_payment_intent_id text,created_at timestamptz);
CREATE TABLE email_campaign_contacts(email text primary key,suppressed_at timestamptz);
CREATE TABLE automation_runs(id uuid primary key default gen_random_uuid(),lead_id uuid references leads(id),status text);
`
  sql += readFileSync('supabase/migrations/004_kanban_crm.sql', 'utf8')
  const inbox = readFileSync('supabase/migrations/006_inbox_sequences_ai_push.sql', 'utf8')
  sql += inbox.slice(0, inbox.indexOf('-- AI LEAD SCORING'))
  for (const name of ['038_pipeline_moves', '039_lead_unico', '045_chargeback_evidence', '047_fix_receipt_digest_search_path', '052_ai_sequences_until_reply', '053_ai_suppression_resolution', '054_sequence_batch_pacing', '055_sequence_batch_completion_clock', '056_sequence_reply_stage', '058_sequence_proven_rejection', '060_sequence_six_per_fifteen', '065_sequence_confirmed_receipts']) {
    sql += readFileSync(`supabase/migrations/${name}.sql`, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '')
  }
  if (existsSync('supabase/migrations/071_admin_new_lead_assignment.sql')) sql += readFileSync('supabase/migrations/071_admin_new_lead_assignment.sql', 'utf8')
  if (existsSync('supabase/migrations/072_assign_new_ignore_email_suppression.sql')) sql += readFileSync('supabase/migrations/072_assign_new_ignore_email_suppression.sql', 'utf8')
  return sql
}
export async function fixture() {
  const db = new PGlite()
  await db.exec(schemaSQL())
  // SQL fixtures intentionally inspect dynamic PostgreSQL rows (including Date values).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = async (sql: string, args: unknown[] = []) => (await db.query<Record<string, any>>(sql, args)).rows
  await q(`insert into buyers(id,auth_user_id,name,email,is_admin) values($1,$2,'Admin','admin@example.test',true),($3,$4,'Buyer','buyer@example.test',false)`, [uuid(1), uuid(11), uuid(2), uuid(12)])
  await q(`insert into credits(id,buyer_id,total_purchased,total_used) values($1,$2,10,3),($3,$4,10,2)`, [uuid(51), uuid(1), uuid(52), uuid(2)])
  await q(`insert into pipelines(id,buyer_id,name,is_default) values($1,$2,'Source',true),($3,$4,'Target',true)`, [uuid(21), uuid(1), uuid(22), uuid(2)])
  await q(`insert into pipeline_stages(id,pipeline_id,name,position) values($1,$2,'New',0),($3,$4,'First',0),($5,$4,'Second',1)`, [uuid(31), uuid(21), uuid(32), uuid(22), uuid(33)])
  await q(`insert into leads(id,name,email,phone,city,state,interest,age_range,reason,birth_date,assigned_to,assigned_at,created_at,meta_lead_id,raw_data,observation,ai_score,delivery_credit_id) values($1,'Fixture','fixture@example.test','+15555550100','City','FL','Life','30-40','Family','1990-01-02',$2,'2020-01-01','2019-01-01','fixture-meta','{"secret":"private"}','private notes',88,$3)`, [uuid(41), uuid(1), uuid(51)])
  await q(`insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)`, [uuid(41), uuid(21), uuid(31)])
  await q(`insert into follow_ups(lead_id,buyer_id,description) values($1,$2,'private task')`, [uuid(41), uuid(1)])
  const call = async (source = 41, buyer = 2, request = 91, actor = 11) => (await q('select admin_assign_lead_as_new($1,$2,$3,$4) result', [uuid(actor), uuid(source), uuid(buyer), uuid(request)]))[0].result
  return { db, q, call }
}
