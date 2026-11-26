import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const buyer = 'b01b6ad0-bc81-4507-80db-d29959e03cad'
const lead = '5f89d0e8-19d3-4f2c-a2e9-bcbb7511307f'
const operation = '696efc69-5b85-4921-8e02-2503d321bcb8'
const phone = '12025550145'
const source = 'automation:pilot'
const accepted = 'wamid.first'

test('Cloud reservations enforce consent, exact ownership, approved copy and one send per operation', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE buyers(id uuid PRIMARY KEY, is_active boolean);
      CREATE TABLE leads(id uuid PRIMARY KEY, assigned_to uuid, assigned_to_member uuid, phone text,
        archived boolean, sms_opted_out boolean, redelivered_to_lead_id uuid);
      CREATE TABLE ai_sequence_suppressions(lead_id uuid, reason text);
      CREATE TABLE sequence_enrollments(id uuid, lead_id uuid, buyer_id uuid, lease_token uuid,
        delivery_status text, enrolled_at timestamptz, current_step int, lease_until timestamptz,
        status text, stop_reason text);
      CREATE TABLE sequence_batch_dispatches(token uuid, enrollment_id uuid, cycle timestamptz, step int,
        sender text, state text, expires_at timestamptz, rejected_at timestamptz, rejection_proof jsonb);
      CREATE TABLE sequence_sender_batches(sender text PRIMARY KEY);
      CREATE TABLE automations(id int PRIMARY KEY, buyer_id uuid, enabled boolean);
      CREATE TABLE automation_runs(id uuid PRIMARY KEY, automation_id int, lead_id uuid, status text);
      CREATE TABLE whatsapp_messages(
        lead_id uuid, buyer_id uuid, direction text, from_phone text, to_phone text,
        body text, wa_message_id text UNIQUE, status text, sent_at timestamptz
      );
      CREATE FUNCTION begin_sequence_batch(uuid,uuid,text,text) RETURNS jsonb LANGUAGE sql AS
      'SELECT jsonb_build_object(''allowed'',true)';
    `)
    await db.exec(readFileSync('supabase/migrations/078_whatsapp_cloud_automation.sql', 'utf8'))
    await db.query('INSERT INTO buyers VALUES($1,true)', [buyer])
    await db.query("INSERT INTO leads VALUES($1,$2,null,'(202) 555-0145',false,false,null)", [lead, buyer])
    await db.query('INSERT INTO automations VALUES(1,$1,true)', [buyer])
    await db.query("INSERT INTO automation_runs VALUES($1,1,$2,'skipped')", [operation, lead])

    const plan = async () => (await db.query<{ plan: unknown }>(
      'SELECT wa_cloud_message_plan($1,$2,$3,$4,$5) AS plan', [phone, lead, buyer, source, 'pt'],
    )).rows[0].plan
    const inbound = async (id: string, consent: boolean | null, body: string, minutesAgo: number, quoted = null as string | null) => {
      await db.query("SELECT apply_wa_cloud_inbound($1, now()-($2::int * interval '1 minute'),$3,$4,$5,$6)",
        [phone, minutesAgo, id, consent, body, quoted])
    }
    const reserve = async (content: unknown, body: string) => (await db.query<{ allowed: boolean }>(
      'SELECT reserve_wa_cloud_dispatch($1,$2,$3,$4,$5,$6,$7,$8,null) AS allowed',
      [operation, phone, lead, buyer, source, 'pt', JSON.stringify(content), body],
    )).rows[0].allowed

    assert.equal(await plan(), null)
    await inbound('wamid.hello', null, 'Olá', 0)
    assert.equal(await plan(), null)
    await inbound('wamid.optin', true, 'ACEITO RECEBER MENSAGENS', 0)
    assert.deepEqual(await plan(), { name: null, language: null, body: null })

    await db.exec("UPDATE wa_cloud_contacts SET last_inbound_at=now()-interval '25 hours'")
    assert.equal(await plan(), null)
    await db.query("INSERT INTO wa_cloud_templates VALUES($1,'pt','approved_notice','pt_BR','Texto aprovado')", [source])
    const template = { name: 'approved_notice', language: 'pt_BR', body: 'Texto aprovado' }
    assert.deepEqual(await plan(), template)
    await db.query('UPDATE leads SET assigned_to_member=$1 WHERE id=$1', [lead])
    assert.equal(await plan(), null)
    await db.query('UPDATE leads SET assigned_to_member=null WHERE id=$1', [lead])
    assert.equal(await reserve(template, 'Outro texto'), false)
    assert.equal(await reserve(template, 'Texto aprovado'), true)
    assert.equal(await reserve(template, 'Texto aprovado'), false)

    await db.query("SELECT apply_wa_cloud_status($1,$2,'delivered',$3)", [operation, accepted, phone])
    await db.query("SELECT finish_wa_cloud_dispatch($1,$2,'accepted')", [operation, accepted])
    // Sequence receipts may keep a nationally formatted ten-digit phone for recovery.
    await db.query("INSERT INTO whatsapp_messages VALUES($1,$2,'out','17867442126','2025550145','Texto aprovado',$3,'sent',now())",
      [lead, buyer, accepted])
    assert.deepEqual((await db.query("SELECT status FROM whatsapp_messages WHERE direction='out'")).rows, [{ status: 'delivered' }])
    await db.query("SELECT apply_wa_cloud_status(null,$1,'read',$2)", [accepted, phone])
    await db.query("SELECT apply_wa_cloud_status($1,$2,'sent',$3)", [operation, accepted, phone])
    assert.deepEqual((await db.query("SELECT status FROM whatsapp_messages WHERE direction='out'")).rows, [{ status: 'read' }])

    await inbound('wamid.stop', false, 'PARE', 0, accepted)
    await inbound('wamid.stop', false, 'PARE', 0, accepted)
    await inbound('wamid.old_optin', true, 'ACEITO RECEBER MENSAGENS', 1)
    assert.equal(await plan(), null)
    assert.deepEqual((await db.query("SELECT body FROM whatsapp_messages WHERE direction='in'")).rows, [{ body: 'STOP' }])

    const enrollment = '36f510ef-94c0-43f3-9bf2-6797db62f6ea'
    const sequenceOperation = 'ffb9e738-3ce1-4cc3-bf85-aa28e4296cc9'
    await inbound('wamid.new_optin', true, 'ACEITO RECEBER MENSAGENS', 0)
    await db.query(`INSERT INTO sequence_enrollments
      VALUES($1,$2,$3,$4,'sending',now(),0,now()+interval '2 minutes','active',null)`,
    [enrollment, lead, buyer, sequenceOperation])
    await db.query(`INSERT INTO sequence_batch_dispatches
      SELECT lease_token,id,enrolled_at,0,'17867442126','sending',lease_until,null,null FROM sequence_enrollments WHERE id=$1`,
    [enrollment])
    await db.exec("INSERT INTO sequence_sender_batches VALUES('17867442126')")
    await db.query(`INSERT INTO wa_cloud_dispatches(operation_id,lead_id,buyer_id,phone,source_key)
      VALUES($1,$2,$3,$4,'ai:pilot:0')`, [sequenceOperation, lead, buyer, phone])
    const settleRejection = async () => (await db.query<{ settled: boolean }>(
      'SELECT settle_wa_cloud_sequence_rejection($1,132001) AS settled', [sequenceOperation],
    )).rows[0].settled
    assert.equal(await settleRejection(), false)
    await db.query("SELECT finish_wa_cloud_dispatch($1,null,'rejected')", [sequenceOperation])
    assert.equal(await settleRejection(), true)
    assert.deepEqual((await db.query('SELECT status,delivery_status,current_step FROM sequence_enrollments')).rows,
      [{ status: 'paused', delivery_status: 'rejected_before_send', current_step: 0 }])

    await db.query(`INSERT INTO wa_cloud_dispatches(operation_id,lead_id,buyer_id,phone,source_key)
      SELECT gen_random_uuid(),$1,$2,$3,'pacing' FROM generate_series(1,4)`, [lead, buyer, phone])
    const throttledOperation = '1e21b253-9440-45ba-80c6-cc5b3437005a'
    await db.query("INSERT INTO automation_runs VALUES($1,1,$2,'skipped')", [throttledOperation, lead])
    assert.equal((await db.query<{ allowed: boolean }>(
      'SELECT reserve_wa_cloud_dispatch($1,$2,$3,$4,$5,$6,$7,$8,null) AS allowed',
      [throttledOperation, phone, lead, buyer, source, 'pt', JSON.stringify(template), 'Texto aprovado'],
    )).rows[0].allowed, false)

    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.query('SELECT phone FROM wa_cloud_contacts'), /permission denied/)
    await assert.rejects(db.query('SELECT wa_cloud_message_plan($1,$2,$3,$4,$5)', [phone, lead, buyer, source, 'pt']), /permission denied/)
  } finally {
    await db.close()
  }
})
