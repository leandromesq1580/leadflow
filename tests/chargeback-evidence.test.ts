import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every paid Checkout requires Stripe terms and carries versioned policy evidence', () => {
  for (const file of [
    'src/app/api/checkout/route.ts',
    'src/app/api/checkout/subscription/route.ts',
    'src/app/api/subscription/upgrade-checkout/route.ts',
    'src/app/api/apolices/checkout/route.ts',
    'src/app/api/roteiro/checkout/route.ts',
  ]) {
    const code = source(file)
    assert.match(code, /checkoutPolicyMetadata/)
    assert.match(code, /consent_collection: stripeTermsConsent/)
    assert.match(code, /policy_required/)
  }
})

test('webhook captures completed purchases and every Stripe dispute lifecycle event', () => {
  const webhook = source('src/app/api/webhook/stripe/route.ts')
  assert.match(webhook, /recordCompletedPurchaseConsent/)
  for (const event of ['created', 'updated', 'closed', 'funds_withdrawn', 'funds_reinstated']) {
    assert.match(webhook, new RegExp(`charge\\.dispute\\.${event}`))
  }
  assert.match(source('src/lib/chargeback-evidence.ts'), /purchase_consents/)
  assert.match(source('src/lib/chargeback-evidence.ts'), /chargeback_events/)
})

test('evidence migration captures delivery/payment/notification and makes proof append-only', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE buyers (id uuid primary key, name text, email text, phone text, created_at timestamptz default now());
      CREATE TABLE policy_acceptances (id uuid primary key default gen_random_uuid(), buyer_id uuid references buyers(id), version text, ip text, user_agent text, accepted_at timestamptz default now());
      CREATE TABLE payments (id uuid primary key default gen_random_uuid(), buyer_id uuid references buyers(id), stripe_session_id text, stripe_payment_intent_id text, product_type text, quantity int, price_per_unit numeric, amount numeric, status text, lead_language text, created_at timestamptz default now());
      CREATE TABLE credits (id uuid primary key, buyer_id uuid references buyers(id), stripe_payment_id text);
      CREATE TABLE leads (id uuid primary key, name text, email text, phone text, state text, campaign_name text, form_name text, meta_lead_id text, assigned_to uuid references buyers(id), assigned_at timestamptz, notified_at timestamptz, lead_language text, created_at timestamptz default now());
      CREATE FUNCTION digest(text,text) RETURNS bytea LANGUAGE SQL IMMUTABLE AS $$ SELECT convert_to($1,'UTF8') $$;
    `)
    await db.exec(source('supabase/migrations/045_chargeback_evidence.sql').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''))
    await db.exec(`
      INSERT INTO buyers (id,name,email) VALUES ('00000000-0000-0000-0000-000000000001','Buyer','buyer@example.com');
      INSERT INTO policy_acceptances (id,buyer_id,version) VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','2026-09-07.1');
      INSERT INTO payments (id,buyer_id,stripe_session_id,stripe_payment_intent_id,product_type,quantity,price_per_unit,amount,status,lead_language)
        VALUES ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000001','cs_paid','pi_paid','lead',10,28,280,'completed','pt');
      INSERT INTO credits (id,buyer_id,stripe_payment_id) VALUES ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','cs_paid');
      INSERT INTO leads (id,name,email,phone,state,lead_language) VALUES ('00000000-0000-0000-0000-000000000040','Lead','lead@example.com','+15555550100','FL','pt');
      UPDATE leads SET assigned_to='00000000-0000-0000-0000-000000000001', assigned_at=now(), delivery_credit_id='00000000-0000-0000-0000-000000000030' WHERE id='00000000-0000-0000-0000-000000000040';
      UPDATE leads SET notified_at=now() WHERE id='00000000-0000-0000-0000-000000000040';
    `)
    const receipt = (await db.query<{ payment_id: string; source: string; masked_email: string }>('select payment_id, source, masked_email from lead_delivery_receipts')).rows[0]
    assert.equal(receipt.payment_id, '00000000-0000-0000-0000-000000000020')
    assert.equal(receipt.source, 'live_assignment')
    assert.equal(receipt.masked_email, 'l***@example.com')
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from lead_notification_receipts')).rows[0].n, 1)
    await assert.rejects(db.exec("update lead_delivery_receipts set source='tampered'"), /append-only/)
  } finally { await db.close() }
})

test('admin center exposes a review-first dossier, never automatic evidence submission', () => {
  const page = source('src/app/admin/chargebacks/page.tsx')
  const dossier = source('src/lib/chargeback-dossier.ts')
  assert.match(page, /Baixar dossiê PDF/)
  assert.match(page, /Revise sempre antes de enviar/)
  assert.match(dossier, /legacy_backfill/)
  assert.doesNotMatch(source('src/lib/chargeback-evidence.ts'), /submit|close:/i)
})
