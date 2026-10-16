import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, uuid } from './admin-new-lead-assignment-fixture'

for (const channel of ['sms', 'wa']) for (const mode of ['legacy', 'ai_until_reply']) {
 test(`${channel}/${mode}: reply before enrollment uses receipt boundary, not enrollment time`, async () => {
  const {db,q,call}=await fixture()
  try {
   await q(`insert into sequences(id,buyer_id,name,trigger_stage_id,mode,ai_config) values($1,$2,'Welcome',$3,$4,'{"timezone":"UTC","start":"00:00","end":"23:59","days":[0,1,2,3,4,5,6]}')`,[uuid(61),uuid(2),uuid(32),mode])
   const r=await call()
   // Claim BEFORE reply, so claim filtering cannot hide an unsafe enroll RPC.
   const effect=(await q("select claim_admin_new_lead_effect('enrollment') e"))[0].e
   if(channel==='sms') await q(`insert into sms_messages(lead_id,direction,body,status,created_at) values($1,'in','Original reply','received',$2)`,[r.lead_id,r.assigned_at])
   else await q(`insert into whatsapp_messages(buyer_id,lead_id,direction,body,from_phone,to_phone,sent_at) values($1,$2,'in','Original reply','15555550100','15555550199',$3)`,[uuid(2),r.lead_id,r.assigned_at])
   const ok=(await q('select enroll_admin_new_lead_sequence($1,$2,$3,clock_timestamp()) ok',[effect.id,effect.token,uuid(61)]))[0].ok
   assert.equal(ok,false)
   assert.equal((await q('select count(*)::int n from sequence_enrollments'))[0].n,0)
   assert.equal((await q('select reason from ai_sequence_suppressions where lead_id=$1',[r.lead_id]))[0].reason,'replied')
   // Independently prove the receipt boundary, not just the new suppression.
   await q('delete from ai_sequence_suppressions where lead_id=$1',[r.lead_id])
   assert.equal((await q('select ai_sequence_block($1,$2,$3,clock_timestamp()) reason',[uuid(2),r.lead_id,uuid(61)]))[0].reason,'replied')
   assert.equal((await q('select enroll_admin_new_lead_sequence($1,$2,$3,clock_timestamp()) ok',[effect.id,effect.token,uuid(61)]))[0].ok,false)
  } finally {await db.close()}
 })
}
for (const channel of ['sms','wa']) test(`${channel}: stale source STOP follows clone chain without moving conversation`,async()=>{
 const {db,q,call}=await fixture()
 try {
  // The same contact may be delivered more than once via an administrative buyer.
  const first=await call(41,1)
  const last=(await q('select admin_assign_lead_as_new($1,$2,$3,$4) r',[uuid(11),first.lead_id,uuid(2),uuid(92)]))[0].r
  const body='STOP', eventAt='2020-02-03T04:05:06.000Z'
  if(channel==='sms') await q(`insert into sms_messages(lead_id,direction,body,status,created_at) values($1,'in',$2,'received',$3)`,[uuid(41),body,eventAt])
  else await q(`insert into whatsapp_messages(buyer_id,lead_id,direction,body,from_phone,to_phone,sent_at) values($1,$2,'in',$3,'15555550100','15555550199',$4)`,[uuid(1),uuid(41),body,eventAt])
  for(const id of [first.lead_id,last.lead_id]) {
   assert.equal((await q('select sms_opted_out from leads where id=$1',[id]))[0].sms_opted_out,true)
   assert.equal((await q('select reason from ai_sequence_suppressions where lead_id=$1',[id]))[0].reason,'optout')
  }
  const table=channel==='sms'?'sms_messages':'whatsapp_messages', time=channel==='sms'?'created_at':'sent_at'
  const messages=await q(`select lead_id,body,${time} event_at from ${table}`)
  assert.equal(messages.length,1);assert.equal(messages[0].lead_id,uuid(41));assert.equal(messages[0].body,body);assert.equal(messages[0].event_at.toISOString(),eventAt)
  assert.equal((await q("select claim_admin_new_lead_effect('enrollment') e"))[0].e,null)
 }finally{await db.close()}
})
test('historical ordinary reply is not replayed into the new cycle; unrelated legacy policy unchanged',async()=>{
 const {db,q,call}=await fixture()
 try{
  await q(`insert into sms_messages(lead_id,direction,body,status,created_at) values($1,'in','Old private conversation','received','2020-01-01')`,[uuid(41)])
  const r=await call()
  await q(`insert into whatsapp_messages(buyer_id,lead_id,direction,body,from_phone,to_phone,sent_at) values($1,$2,'in','Delayed private conversation','15555550100','15555550199','2020-01-01')`,[uuid(1),uuid(41)])
  assert.equal((await q('select count(*)::int n from ai_sequence_suppressions where lead_id=$1',[r.lead_id]))[0].n,0)
  assert.equal((await q('select count(*)::int n from whatsapp_messages where lead_id=$1',[r.lead_id]))[0].n,0)
 }finally{await db.close()}
})
