import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, uuid } from './admin-new-lead-assignment-fixture'

test('replay is stable across request IDs; reusing request for a different payload conflicts', async () => {
  const { db, q, call } = await fixture()
  try {
    const first = await call()
    assert.deepEqual(await call(), { ...first, replayed: true })
    assert.deepEqual(await call(41, 2, 92), { ...first, replayed: true })
    await assert.rejects(call(41, 1, 91), /request_conflict/)
    await assert.rejects(call(41, 1, 92), /request_conflict/)
    await assert.rejects(call(41, 1, 93), /source_already_delivered/)
    await assert.rejects(call(99, 2, 91), /request_conflict/)
    await assert.rejects(call(99, 2, 92), /request_conflict/)
    await assert.rejects(q('update leads set redelivered_to_lead_id=null where id=$1',[uuid(41)]),/redelivery_immutable/)
    await assert.rejects(q('update leads set archived=false where id=$1',[uuid(41)]),/redelivery_immutable/)
    assert.equal((await q('select total_used from credits where id=$1', [uuid(52)]))[0].total_used, 3)
    assert.equal((await q('select count(*)::int n from admin_new_lead_assignments'))[0].n, 1)
  } finally { await db.close() }
})

test('eligibility rejects unsafe sources/targets atomically and never bypasses consent or net debt', async () => {
  const { db, q, call } = await fixture()
  try {
    const cases = [
      [`update leads set archived=true`, /source_unavailable/],
      [`update leads set contract_closed=true`, /source_unavailable/],
      [`update pipeline_stages set name='Fechado/Ganho' where id='${uuid(31)}'`, /source_unavailable/],
      [`update buyers set is_admin=false where id='${uuid(1)}'`, /forbidden/],
      [`update leads set assigned_to='${uuid(2)}'`, /source_not_admin/],
      [`update leads set sms_opted_out=true`, /contact_blocked/],
      [`insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values('${uuid(1)}','${uuid(41)}','manual')`, /contact_blocked/],
      [`update buyers set is_active=false where id='${uuid(2)}'`, /buyer_unavailable/],
      [`update leads set lead_language='en'; update credits set lead_language='en'`, /unsupported_language/],
      [`update pipelines set is_default=false where id='${uuid(22)}'`, /pipeline_unavailable/],
      [`insert into pipelines(buyer_id,name,is_default) values('${uuid(2)}','Duplicate',true)`, /pipeline_unavailable/],
      [`delete from pipeline_stages where pipeline_id='${uuid(22)}'`, /pipeline_unavailable/],
      [`update credits set expires_at='2000-01-01' where buyer_id='${uuid(2)}'`, /no_credit/],
      [`insert into credits(buyer_id,total_purchased,total_used,expires_at) values('${uuid(2)}',0,8,'2000-01-01')`, /no_credit/],
    ] as const
    for (const [setup, reason] of cases) {
      await q('begin'); await db.exec(setup)
      const before = await q('select id,total_used from credits order by id')
      await q('savepoint attempt')
      await assert.rejects(call(), reason, setup)
      await q('rollback to savepoint attempt')
      assert.deepEqual(await q('select id,total_used from credits order by id'), before)
      assert.equal((await q('select count(*)::int n from admin_new_lead_assignments'))[0].n, 0)
      assert.equal((await q('select count(*)::int n from leads'))[0].n, 1)
      await q('rollback')
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await q("select has_function_privilege($1,'admin_assign_lead_as_new(uuid,uuid,uuid,uuid)','execute') ok", [role]))[0].ok, role === 'service_role')
      assert.equal((await q("select has_table_privilege($1,'admin_new_lead_assignments','select') ok", [role]))[0].ok, role === 'service_role')
    }
    // Administrative targets are charged too, even when source and destination are the same account.
    assert.equal((await call(41, 1)).remaining, 6)
    assert.equal((await q('select total_used from credits where id=$1', [uuid(51)]))[0].total_used, 4)
  } finally { await db.close() }
})

test('buyer lookup covers full customer base, literal search, stable pages and net-language eligibility', async () => {
 const { db,q }=await fixture()
 try {
  assert.equal((await q("select count(*)::int n from pg_proc where proname='admin_new_lead_assignment_options'"))[0].n,1)
  const get=async(cursor:string|null=null,search='')=>(await q('select admin_new_lead_assignment_options($1,$2,$3,$4,$5) result',[uuid(11),uuid(41),search,cursor,1]))[0].result
  const first=await get(); assert.equal(first.lead.language,'pt'); assert.equal(first.buyers[0].id,uuid(1)); assert.equal(first.next_cursor,uuid(1))
  const second=await get(first.next_cursor); assert.equal(second.buyers[0].id,uuid(2));assert.equal(second.next_cursor,null)
  assert.equal(second.buyers[0].eligible,true);assert.equal(second.buyers[0].remaining,8)
  assert.equal((await get(null,'buyer@example')).buyers[0].id,uuid(2))
  assert.deepEqual((await get(null,'%,()')).buyers,[])
  await q('update credits set total_used=total_purchased where buyer_id=$1',[uuid(2)])
  assert.equal((await get(uuid(1))).buyers[0].reason,'no_credit')
  await assert.rejects(q('select admin_new_lead_assignment_options($1,$2)',[uuid(12),uuid(41)]),/forbidden/)
 } finally {await db.close()}
})

test('durable effects claim once, quarantine uncertain notification and safely retry enrollment without reactivation', async () => {
 const { db,q,call }=await fixture()
 try {
  assert.equal((await q("select count(*)::int n from pg_proc where proname='claim_admin_new_lead_effect'"))[0].n,1)
  await q(`insert into sequences(id,buyer_id,name,trigger_stage_id) values($1,$2,'Welcome',$3)`,[uuid(61),uuid(2),uuid(32)])
  const result=await call()
  assert.equal((await q('select count(*)::int n from admin_new_lead_effects'))[0].n,3)
  const claim=async(kind:string)=>(await q('select claim_admin_new_lead_effect($1) result',[kind]))[0].result
  const notify=await claim('notification');assert.equal(notify.lead_id,result.lead_id)
  assert.equal(await claim('notification'),null)
  await q("update admin_new_lead_effects set lease_until=now()-interval '1 minute' where kind='notification'")
  assert.equal(await claim('notification'),null)
  assert.equal((await q("select state from admin_new_lead_effects where kind='notification'"))[0].state,'unknown')
  const enroll=await claim('enrollment')
  const enrollOnce=async()=>(await q('select enroll_admin_new_lead_sequence($1,$2,$3,$4) ok',[enroll.id,enroll.token,uuid(61),new Date().toISOString()]))[0].ok
  assert.equal(await enrollOnce(),true)
  await q("update sequence_enrollments set status='stopped'")
  assert.equal(await enrollOnce(),true)
  assert.equal((await q('select status from sequence_enrollments'))[0].status,'stopped')
  const done=await q("select finish_admin_new_lead_effect($1,$2,'done') ok",[enroll.id,enroll.token]);assert.equal(done[0].ok,true)
  assert.equal(await claim('enrollment'),null)
  const status=(await q('select admin_new_lead_assignment_status($1,$2,$3) result',[uuid(11),uuid(41),uuid(91)]))[0].result
  assert.equal(status.lead_id,result.lead_id);assert.equal(status.notifications_pending,true)
 }finally{await db.close()}
})

test('source becomes terminal without deleting history; in-flight work blocks and receipt failure rolls everything back', async () => {
 const {db,q,call}=await fixture()
 try{
  await q(`insert into sequences(id,buyer_id,name,trigger_stage_id) values($1,$2,'Old sequence',$3)`,[uuid(61),uuid(1),uuid(31)])
  await q(`insert into sequence_enrollments(sequence_id,lead_id,buyer_id,status) values($1,$2,$3,'active')`,[uuid(61),uuid(41),uuid(1)])
  await q(`insert into sms_messages(lead_id,direction,status) values($1,'out','scheduled')`,[uuid(41)])
  await q(`insert into automation_runs(lead_id,status) values($1,'skipped')`,[uuid(41)])
  await assert.rejects(call(),/source_busy/)
  await q("update automation_runs set status='success'")
  await q("update sms_messages set status='sending'")
  await assert.rejects(call(),/source_busy/)
  await q("update sms_messages set status='scheduled'")
  await db.exec(`create function fixture_fail_receipt() returns trigger language plpgsql as $$ begin if NEW.lead_id<>'${uuid(41)}' then raise exception 'receipt_unavailable'; end if;return NEW;end $$;create trigger fixture_fail_receipt before insert on lead_delivery_receipts for each row execute function fixture_fail_receipt();`)
  await assert.rejects(call(),/receipt_unavailable/)
  assert.equal((await q('select archived from leads where id=$1',[uuid(41)]))[0].archived,false)
  assert.equal((await q('select status from sequence_enrollments'))[0].status,'active')
  assert.equal((await q('select status from sms_messages'))[0].status,'scheduled')
  assert.equal((await q('select total_used from credits where id=$1',[uuid(52)]))[0].total_used,2)
  assert.equal((await q('select count(*)::int n from admin_new_lead_effects'))[0].n,0)
  await q('drop trigger fixture_fail_receipt on lead_delivery_receipts')
  const result=await call()
  assert.equal((await q('select redelivered_to_lead_id from leads where id=$1',[uuid(41)]))[0].redelivered_to_lead_id,result.lead_id)
  assert.equal((await q('select status from sequence_enrollments'))[0].status,'stopped')
  assert.equal((await q('select status from sms_messages'))[0].status,'canceled')
  await assert.rejects(q("insert into automation_runs(lead_id,status) values($1,'skipped')",[uuid(41)]),/source_redelivered/)
  await assert.rejects(q("update sms_messages set status='sending' where lead_id=$1",[uuid(41)]),/source_redelivered/)
 }finally{await db.close()}
})

test('paid new cycle preserves original audit and creates a current clean lead with receipt', async () => {
  const { db, q, call } = await fixture()
  try {
    assert.equal((await q("select count(*)::int n from pg_proc where proname='admin_assign_lead_as_new'"))[0].n, 1, 'transactional assignment RPC exists')
    const before = (await q('select * from leads where id=$1', [uuid(41)]))[0]
    const receipts = await q('select * from lead_delivery_receipts where lead_id=$1', [uuid(41)])
    const start = Date.now()
    const result = await call()
    assert.equal(result.success, true)
    assert.notEqual(result.lead_id, uuid(41))
    assert.equal(result.remaining, 7)
    assert.equal(result.replayed, false)
    const clone = (await q('select * from leads where id=$1', [result.lead_id]))[0]
    assert.equal(clone.created_at.getTime(), clone.assigned_at.getTime())
    assert.ok(clone.created_at.getTime() >= start)
    for (const field of ['name', 'email', 'phone', 'city', 'state', 'interest', 'age_range', 'reason']) assert.equal(clone[field], before[field])
    assert.deepEqual(clone.birth_date, before.birth_date)
    for (const field of ['meta_lead_id', 'raw_data', 'observation', 'ai_score', 'assigned_to_member', 'notified_at']) assert.equal(clone[field], null)
    assert.equal(clone.redelivery_source_id, uuid(41))
    assert.equal(clone.delivery_credit_id, uuid(52))
    assert.equal(clone.assigned_to, uuid(2))
    assert.equal(clone.status, 'assigned')
    assert.equal(clone.type, 'hot')
    assert.equal(clone.product_type, 'lead')
    const origin = (await q('select * from leads where id=$1', [uuid(41)]))[0]
    assert.equal(origin.archived, true)
    for (const field of ['assigned_to', 'meta_lead_id', 'observation', 'delivery_credit_id']) assert.equal(origin[field], before[field])
    assert.deepEqual(await q('select * from lead_delivery_receipts where lead_id=$1', [uuid(41)]), receipts)
    assert.equal((await q('select credit_id from lead_delivery_receipts where lead_id=$1', [result.lead_id]))[0].credit_id, uuid(52))
    assert.equal((await q('select total_used from credits where id=$1', [uuid(51)]))[0].total_used, 3)
    assert.equal((await q('select stage_id from pipeline_leads where lead_id=$1', [result.lead_id]))[0].stage_id, uuid(32))
    assert.equal((await q('select count(*)::int n from pipeline_leads where lead_id=$1', [uuid(41)]))[0].n, 1)
    assert.equal((await q('select count(*)::int n from follow_ups where lead_id=$1', [result.lead_id]))[0].n, 0)
  } finally { await db.close() }
})

test('email-campaign suppression (bounce/unsubscribe) does not block a WhatsApp/SMS lead; STOP and AI blocks still do', async () => {
  const { db, q, call } = await fixture()
  try {
    await q(`insert into email_campaign_contacts(email,suppressed_at) values('fixture@example.test',now())`)
    assert.equal((await q(`select count(*)::int n from leads where lower(email)='fixture@example.test'`))[0].n, 1, 'fixture lead has the suppressed e-mail')
    const result = await call()
    assert.equal(result.success, true)
    assert.equal((await q('select count(*)::int n from admin_new_lead_assignments'))[0].n, 1)
    assert.equal((await q('select total_used from credits where id=$1', [uuid(52)]))[0].total_used, 3, 'exactly one credit debited from recipient')
  } finally { await db.close() }
})

test('real STOP still blocks even when e-mail is not suppressed', async () => {
  const { db, q, call } = await fixture()
  try {
    await q('update leads set sms_opted_out=true')
    await assert.rejects(call(), /contact_blocked/)
  } finally { await db.close() }
})
