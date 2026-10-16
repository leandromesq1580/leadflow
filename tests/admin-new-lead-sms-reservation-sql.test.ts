import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, uuid } from './admin-new-lead-assignment-fixture'

// Real migration071 on local PostgreSQL/WASM. These are statement-order tests,
// not a claim of independent PostgreSQL sessions (parent owns that suite).
test('real SQL: immediate sending/unknown reservations fence paid redelivery', async () => {
  const { db, q, call } = await fixture()
  try {
    const [sms] = await q("insert into sms_messages(lead_id,direction,status) values($1,'out','sending') returning id", [uuid(41)])
    await assert.rejects(call(), /source_busy/)
    await q("update sms_messages set status='unknown' where id=$1", [sms.id])
    await assert.rejects(call(), /source_busy/)
    assert.equal((await q('select archived from leads where id=$1', [uuid(41)]))[0].archived, false)
    assert.equal((await q('select count(*)::int n from admin_new_lead_assignments'))[0].n, 0)
    assert.equal((await q('select total_used from credits where id=$1', [uuid(52)]))[0].total_used, 2)
  } finally { await db.close() }
})

test('real SQL: retirement wins before immediate INSERT or scheduled CAS; no reservation can escape', async () => {
  const { db, q, call } = await fixture()
  try {
    const [sms] = await q("insert into sms_messages(lead_id,direction,status) values($1,'out','scheduled') returning id", [uuid(41)])
    const result = await call()
    assert.equal((await q('select status from sms_messages where id=$1', [sms.id]))[0].status, 'canceled')
    assert.deepEqual(await q("update sms_messages set status='sending' where id=$1 and status='scheduled' returning id", [sms.id]), [])
    await assert.rejects(q("insert into sms_messages(lead_id,direction,status) values($1,'out','sending')", [uuid(41)]), /source_redelivered/)
    await assert.rejects(q("update sms_messages set status='sending' where id=$1", [sms.id]), /source_redelivered/)
    // The clean destination is not mistakenly blocked by its redelivery provenance.
    const clone = await q("insert into sms_messages(lead_id,direction,status) values($1,'out','sending') returning id", [result.lead_id])
    assert.equal(clone.length, 1)
  } finally { await db.close() }
})

test('real SQL: scheduled CAS reserves once and source_busy holds until confirmed terminal status', async () => {
  const { db, q, call } = await fixture()
  try {
    const [sms] = await q("insert into sms_messages(lead_id,direction,status) values($1,'out','scheduled') returning id", [uuid(41)])
    const claim = () => q("update sms_messages set status='sending' where id=$1 and status='scheduled' returning id", [sms.id])
    assert.equal((await claim()).length, 1)
    assert.deepEqual(await claim(), [])
    await assert.rejects(call(), /source_busy/)
    await q("update sms_messages set status='sent',twilio_sid='fixture-confirmed' where id=$1 and status='sending'", [sms.id])
    assert.equal((await call()).success, true)
    assert.equal((await q('select status from sms_messages where id=$1', [sms.id]))[0].status, 'sent')
  } finally { await db.close() }
})
