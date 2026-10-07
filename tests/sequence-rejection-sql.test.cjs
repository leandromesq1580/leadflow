/* eslint-disable @typescript-eslint/no-require-imports -- Offline PostgreSQL/WASM harness. */
// All data is SYNTHETIC; migrations/RPCs/triggers are real. Single session, NOT concurrency proof.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const migration = 'supabase/migrations/058_sequence_proven_rejection.sql'
// Reuse the baseline's synthetic schema verbatim, without running/importing its tests.
const base = fs.readFileSync('tests/sequence-batch-sql.test.cjs', 'utf8')
const setup = new Function('require', base.slice(0, base.indexOf("test('legacy cancellations")) + '\nreturn {fixture,applyPacing,buyer,other};')(require)
const sender = '15555550100'
const proof = e => ({version:2,operation_id:e.lease_token,sender,outcome:'rejected_before_send',code:'bridge_not_ready'})
async function fixture() {
  const f = await setup.fixture()
  await setup.applyPacing(f.db)
  if (fs.existsSync(migration)) await f.db.exec(fs.readFileSync(migration, 'utf8'))
  return f
}
async function make(db, mode='legacy', phone=sender) {
  const l=(await db.query('insert into leads(id,assigned_to) values(gen_random_uuid(),$1) returning id',[setup.buyer])).rows[0]
  const s=(await db.query("insert into sequences(buyer_id,name,mode,enabled,ai_config) values($1,'SYNTHETIC',$2,true,$3) returning id",[setup.buyer,mode,{timezone:'UTC',days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'}])).rows[0]
  await db.query("insert into sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body) values($1,0,0,'send_template','SYNTHETIC')",[s.id])
  const e=(await db.query("select * from enroll_sequence($1,$2,$3,'2000-01-01')",[setup.buyer,s.id,l.id])).rows[0]
  const c=(await db.query(`select * from ${mode==='legacy'?'claim_legacy_sequence':'claim_ai_sequence'}($1)`,[e.id])).rows[0]
  const allowed=(await db.query("select begin_sequence_batch($1,$2,$3,'SYNTHETIC') r",[c.id,c.lease_token,phone])).rows[0].r.allowed
  return {...c,allowed}
}
async function reject(db,e,p=proof(e),overrides={}) {
  const v={id:e.id,token:e.lease_token,cycle:e.enrolled_at,step:e.current_step,sender,...overrides}
  return (await db.query('select reject_sequence_batch($1,$2,$3,$4,$5,$6) ok',[v.id,v.token,v.cycle,v.step,v.sender,p])).rows[0].ok
}
async function state(db,e) {
  return {e:(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0],d:(await db.query('select * from sequence_batch_dispatches where token=$1',[e.lease_token])).rows[0],b:(await db.query('select * from sequence_sender_batches where sender=$1',[sender])).rows[0]}
}
test('proven rejection settles only its reservation, pauses without receipt/advance, and is idempotent', async()=>{
  const {db}=await fixture()
  try {
    assert.ok((await db.query("select to_regprocedure('public.reject_sequence_batch(uuid,uuid,timestamptz,integer,text,jsonb)') f")).rows[0].f,'specific rejection RPC must exist')
    for (const mode of ['legacy','ai_until_reply']) {
      const e=await make(db,mode); assert.equal(e.allowed,true)
      const before=await state(db,e)
      assert.equal(await reject(db,e),true)
      const after=await state(db,e)
      assert.equal(after.d.state,'rejected_before_send');assert.deepEqual(after.d.rejection_proof,proof(e))
      assert.equal(after.e.status,'paused');assert.equal(after.e.stop_reason,'send_rejected_before_send')
      assert.equal(after.e.current_step,0);assert.equal(after.e.last_sent_at,null);assert.equal(after.e.lease_token,null)
      assert.equal(after.b.used,before.b.used);assert.ok(after.b.last_settled_at>=before.b.last_settled_at)
      assert.equal((await db.query('select count(*)::int n from whatsapp_messages')).rows[0].n,0)
      assert.equal(await reject(db,e),true);assert.deepEqual(await state(db,e),after)
      assert.equal((await db.query(`select * from ${mode==='legacy'?'claim_legacy_sequence':'claim_ai_sequence'}($1)`,[e.id])).rows.length,0)
    }
  } finally {await db.close()}
})

test('proof/correlation/lease failures are no-ops; historical unknown is never resolved; service_role only',async()=>{
 const {db}=await fixture()
 try {
  const e=await make(db), original=await state(db,e)
  for(const p of [null,{},'"Not connected"',{...proof(e),version:1},{...proof(e),version:'2'},{...proof(e),operation_id:setup.other},{...proof(e),sender:'15555550999'},{...proof(e),outcome:'unknown'},{...proof(e),code:'timeout'},{...proof(e),raw:'PRIVATE SYNTHETIC'},{...proof(e),code:null}]) {
   assert.equal(await reject(db,e,p),false);assert.deepEqual(await state(db,e),original)
  }
  for(const o of [{id:setup.other},{token:setup.other},{cycle:'2000-01-01'},{step:1},{sender:'15555550999'},{sender:null},{cycle:null},{step:null}]) {
   assert.equal(await reject(db,e,proof(e),o),false);assert.deepEqual(await state(db,e),original)
  }
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await db.query("select has_function_privilege($1,'public.reject_sequence_batch(uuid,uuid,timestamptz,integer,text,jsonb)','execute') ok",[role])).rows[0].ok,role==='service_role')
  }
  await db.exec('SET ROLE authenticated')
  await assert.rejects(reject(db,e), /permission denied/)
  await db.exec('RESET ROLE')
  await db.query("update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=$1",[e.id])
  assert.equal(await reject(db,e),false)
  await db.query("select defer_sequence_batch($1,$2,'delivery_unknown',now(),true)",[e.id,e.lease_token])
  const quarantined=await state(db,e)
  const suppression=(await db.query('select * from ai_sequence_suppressions where lead_id=$1',[e.lead_id])).rows
  assert.equal(quarantined.d.state,'unknown');assert.equal(await reject(db,e),false)
  assert.deepEqual(await state(db,e),quarantined)
  assert.deepEqual((await db.query('select * from ai_sequence_suppressions where lead_id=$1',[e.lead_id])).rows,suppression)
 }finally{await db.close()}
})

test('reject vs finish/expiry/defer: sequential interleavings keep terminal states and evidence',async()=>{
 const {db}=await fixture()
 try {
  const finish=async e=>(await db.query("select finish_sequence_batch($1,$2,$3,'synthetic',now(),$4,'15555550200') ok",[e.id,e.lease_token,'synthetic-'+e.id,sender])).rows[0].ok
  const rejected=await make(db);assert.equal(await reject(db,rejected),true)
  const snapshot=await state(db,rejected)
  assert.equal(await finish(rejected),false)
  await db.query("select defer_sequence_batch($1,$2,'delivery_unknown',now(),true)",[rejected.id,rejected.lease_token])
  assert.equal((await db.query('select expire_sequence_batch_dispatches($1) n',[sender])).rows[0].n,0)
  assert.deepEqual(await state(db,rejected),snapshot)
  const sent=await make(db);assert.equal(await finish(sent),true)
  const sentState=await state(db,sent);assert.equal(await reject(db,sent),false);assert.deepEqual(await state(db,sent),sentState)
  const expired=await make(db)
  await db.query("update sequence_batch_dispatches set expires_at=clock_timestamp()-interval '1 second' where token=$1",[expired.lease_token])
  assert.equal(await reject(db,expired),false,'deadline alone refuses settlement')
  assert.equal((await db.query('select expire_sequence_batch_dispatches($1) n',[sender])).rows[0].n,1)
  assert.equal(await reject(db,expired),false);assert.equal(await finish(expired),false)
  assert.equal((await state(db,expired)).d.state,'unknown')
 }finally{await db.close()}
})

test('STOP, pause, reply, ownership and suppression survive rejection in either order',async()=>{
 const {db}=await fixture()
 try {
  for(const mode of ['legacy','ai_until_reply']) for(const kind of ['paused','stopped','reply','optout','owner']) {
   // Different sender per group avoids hitting the intentionally retained ten slots.
   const phone=mode==='legacy'?sender:'15555550101'
   const e=await make(db,mode,phone);assert.equal(e.allowed,true)
   if(kind==='paused')await db.query("update sequence_enrollments set status='paused',stop_reason='synthetic_pause' where id=$1",[e.id])
   if(kind==='stopped')await db.query('select stop_sequence_enrollment($1,$2)',[setup.buyer,e.id])
   if(['reply','optout'].includes(kind))await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,'in','15555550200',$3,$4)",[setup.buyer,e.lead_id,phone,kind==='optout'?'STOP':'SYNTHETIC reply'])
   if(kind==='owner')await db.query('update leads set assigned_to=$1 where id=$2',[setup.other,e.lead_id])
   const before=await state(db,e), suppression=(await db.query('select * from ai_sequence_suppressions where lead_id=$1',[e.lead_id])).rows
   assert.equal(await reject(db,e,{...proof(e),sender:phone},{sender:phone}),true)
   const after=await state(db,e)
   assert.equal(after.e.status,before.e.status);assert.equal(after.e.stop_reason,before.e.stop_reason)
   assert.equal(after.e.current_step,0)
   assert.deepEqual((await db.query('select * from ai_sequence_suppressions where lead_id=$1',[e.lead_id])).rows,suppression)
   assert.equal((await db.query("select count(*)::int n from whatsapp_messages where direction='out' and lead_id=$1",[e.lead_id])).rows[0].n,0)
  }
  const e=await make(db);assert.equal(await reject(db,e),true)
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,'in','15555550200',$3,'STOP')",[setup.buyer,e.lead_id,sender])
  assert.equal(await reject(db,e),true)
  const after=await state(db,e);assert.equal(after.e.status,'stopped');assert.equal(after.e.stop_reason,'optout')
 }finally{await db.close()}
})

test('ten reservations include rejections; cooldown is five minutes from completion, partial reset respects clock',async()=>{
 const {db}=await fixture()
 try {
  const entries=[]
  for(let i=0;i<10;i++){const e=await make(db);assert.equal(e.allowed,true);entries.push(e)}
  // Synthetic time travel of persisted clocks only, not a claim about real latency.
  await db.query("update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '10 minutes',last_settled_at=clock_timestamp()-interval '10 minutes',cooldown_until=clock_timestamp()-interval '1 second' where sender=$1",[sender])
  for(const e of entries)assert.equal(await reject(db,e),true)
  const b=(await state(db,entries[0])).b
  assert.equal(b.used,10);assert.ok(b.cooldown_until-b.last_settled_at>=300000)
  assert.equal((await make(db)).allowed,false,'eleventh blocked after all ten rejected')
  await db.query("update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second' where sender=$1",[sender])
  const partial=await make(db);assert.equal(partial.allowed,true);assert.equal((await state(db,partial)).b.used,1)
  await db.query("update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '10 minutes',last_settled_at=clock_timestamp()-interval '10 minutes' where sender=$1",[sender])
  assert.equal(await reject(db,partial),true)
  const next=await make(db);assert.equal(next.allowed,true);assert.equal((await state(db,next)).b.used,2,'no partial reset just because reservation was old')
  assert.equal(await reject(db,next),true)
  await db.query("update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '6 minutes',last_settled_at=clock_timestamp()-interval '6 minutes' where sender=$1",[sender])
  const fresh=await make(db);assert.equal(fresh.allowed,true);assert.equal((await state(db,fresh)).b.used,1)
 }finally{await db.close()}
})

test('another unknown still blocks sender; closed AI window grants no new transport',async()=>{
 const {db}=await fixture()
 try {
  const ambiguous=await make(db), rejected=await make(db)
  await db.query("select defer_sequence_batch($1,$2,'delivery_unknown',now(),true)",[ambiguous.id,ambiguous.lease_token])
  assert.equal(await reject(db,rejected),true)
  await db.query("update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '1 day',last_settled_at=clock_timestamp()-interval '1 day',cooldown_until=clock_timestamp()-interval '1 day' where sender=$1",[sender])
  assert.equal((await make(db)).allowed,false)
  assert.equal((await state(db,ambiguous)).d.state,'unknown')
  const s=(await db.query("insert into sequences(buyer_id,name,mode,enabled,ai_config) values($1,'SYNTHETIC','ai_until_reply',true,$2) returning id",[setup.buyer,{timezone:'UTC',days:[0,1,2,3,4,5,6],start:'00:00',end:'00:01'}])).rows[0]
  // Choose a day that is definitely not today's UTC day, independent of test time.
  await db.query("update sequences set ai_config=jsonb_set(ai_config,'{days}',jsonb_build_array((extract(dow from clock_timestamp() at time zone 'UTC')::int+1)%7)) where id=$1",[s.id])
  const l=(await db.query('insert into leads(id,assigned_to) values(gen_random_uuid(),$1) returning id',[setup.buyer])).rows[0]
  const e=(await db.query("select * from enroll_sequence($1,$2,$3,'2000-01-01')",[setup.buyer,s.id,l.id])).rows[0]
  const c=(await db.query('select * from claim_ai_sequence($1)',[e.id])).rows[0]
  assert.equal((await db.query("select begin_sequence_batch($1,$2,'15555550999','SYNTHETIC') r",[c.id,c.lease_token])).rows[0].r.allowed,false)
  assert.equal((await db.query('select count(*)::int n from sequence_batch_dispatches where enrollment_id=$1',[e.id])).rows[0].n,0)
 }finally{await db.close()}
})
