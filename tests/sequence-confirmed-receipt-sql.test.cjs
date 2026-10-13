const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
// Reuse the exact existing synthetic schema and guards, not production data.
const fixtureSource = fs.readFileSync('tests/sequence-batch-sql.test.cjs','utf8').split('\ntest(')[0]
const { fixture, applyPacing } = new Function('require', fixtureSource + '\nreturn {fixture,applyPacing}') (require)
async function setup() {
  const f=await fixture()
  await applyPacing(f.db)
  await f.db.exec("alter table leads add column phone text; update leads set phone='19145550000'; update sequences set ai_config='{\"timezone\":\"UTC\",\"days\":[0,1,2,3,4,5,6],\"start\":\"00:00\",\"end\":\"23:59\"}'")
  f.e=(await f.db.query('select * from claim_ai_sequence($1)',[f.e.id])).rows[0]
  const path='supabase/migrations/065_sequence_confirmed_receipts.sql'
  if (fs.existsSync(path)) await f.db.exec(fs.readFileSync(path,'utf8'))
  return f
}
async function call(db,name,args) { const n=Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(','); return (await db.query(`select public.${name}(${n}) value`,Object.values(args))).rows[0].value }
function proof(e) { return {p_id:e.id,p_token:e.lease_token,p_wa:'synthetic-receipt-late',p_choice:'synthetic-choice',p_next:'2030-01-01T10:00:00Z',p_from:'18635550111',p_to:'19145550000'} }
for(const [name,override,mutation] of [
  ['wrong operation',{p_token:'00000000-0000-4000-8000-000000000099'},null],
  ['wrong sender',{p_from:'18635550999'},null],
  ['wrong recipient',{p_to:'19145550999'},null],
  ['empty receipt',{p_wa:''},null],
  ['new cycle',{},"update sequence_enrollments set enrolled_at=enrolled_at+interval '1 second'"],
  ['different step',{},'update sequence_enrollments set current_step=current_step+1'],
]) test(`${name}: cannot settle a different dispatch`,async()=>{
  const {db,e}=await setup();try{
    await call(db,'begin_sequence_batch',{p_id:e.id,p_token:e.lease_token,p_sender:'18635550111',p_body:'synthetic body'})
    if(mutation)await db.exec(mutation)
    assert.equal(await call(db,'confirm_sequence_delivery',{...proof(e),...override}),false)
    assert.equal((await db.query('select state from sequence_batch_dispatches where token=$1',[e.lease_token])).rows[0].state,'sending')
    assert.equal((await db.query('select count(*)::int n from whatsapp_messages')).rows[0].n,0)
  }finally{await db.close()}
})
for(const [status,reason] of [['paused','pausado_pelo_dono'],['stopped','resposta_do_lead'],['stopped','opt_out']])
 test(`late acknowledgement preserves ${status}/${reason}`,async()=>{
  const {db,e}=await setup();try{
    await call(db,'begin_sequence_batch',{p_id:e.id,p_token:e.lease_token,p_sender:'18635550111',p_body:'synthetic body'})
    await db.query('update sequence_enrollments set status=$1,stop_reason=$2,lease_token=null,lease_until=null where id=$3',[status,reason,e.id])
    await db.query("insert into ai_sequence_suppressions(buyer_id,lead_id,reason) select buyer_id,lead_id,$1 from sequence_enrollments where id=$2",[reason==='opt_out'?'optout':reason==='pausado_pelo_dono'?'manual':'replied',e.id])
    assert.equal(await call(db,'confirm_sequence_delivery',proof(e)),true)
    const row=(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0]
    assert.equal(row.status,status);assert.equal(row.stop_reason,reason);assert.equal(row.current_step,1)
    assert.equal((await db.query('select resolved_at from ai_sequence_suppressions')).rows[0].resolved_at,null)
    assert.equal((await db.query('select state from sequence_batch_dispatches where token=$1',[e.lease_token])).rows[0].state,'sent')
  }finally{await db.close()}
 })
test('a committed finish with a lost response is idempotently recognized',async()=>{
  const {db,e}=await setup();try{
    await call(db,'begin_sequence_batch',{p_id:e.id,p_token:e.lease_token,p_sender:'18635550111',p_body:'synthetic body'})
    assert.equal(await call(db,'finish_sequence_batch',proof(e)),true)
    assert.equal(await call(db,'confirm_sequence_delivery',proof(e)),true)
    assert.equal(await call(db,'confirm_sequence_delivery',proof(e)),true)
    assert.equal((await db.query('select current_step,status from sequence_enrollments where id=$1',[e.id])).rows[0].current_step,1)
    assert.equal((await db.query('select count(*)::int n from whatsapp_messages')).rows[0].n,1)
  }finally{await db.close()}
})
test('receipt RPC is restricted to service role',async()=>{
  const {db}=await setup();try{
    const signature='public.confirm_sequence_delivery(uuid,uuid,text,text,timestamptz,text,text)'
    for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok',[role,signature,'EXECUTE'])).rows[0].ok,false)
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok',['service_role',signature,'EXECUTE'])).rows[0].ok,true)
  }finally{await db.close()}
})

test('confirmed same-operation receipt settles an expired unknown dispatch without reactivating it',async()=>{
  const {db,e}=await setup()
  try {
    assert.equal((await call(db,'begin_sequence_batch',{p_id:e.id,p_token:e.lease_token,p_sender:'18635550111',p_body:'synthetic body'})).allowed,true)
    await db.query("update sequence_enrollments set lease_until=now()-interval '1 second' where id=$1",[e.id])
    await db.query("update sequence_batch_dispatches set expires_at=now()-interval '1 second' where enrollment_id=$1",[e.id])
    await call(db,'defer_sequence_batch',{p_id:e.id,p_token:e.lease_token,p_reason:'delivery_unknown',p_next:new Date().toISOString(),p_unknown:true})
    assert.equal(await call(db,'confirm_sequence_delivery',proof(e)),true)
    assert.equal(await call(db,'confirm_sequence_delivery',proof(e)),true)
    const row=(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0]
    assert.equal(row.status,'paused');assert.equal(row.stop_reason,'delivery_confirmed_paused')
    assert.equal(row.delivery_status,'sent');assert.equal(row.current_step,1)
    const d=(await db.query('select * from sequence_batch_dispatches where enrollment_id=$1',[e.id])).rows[0]
    assert.equal(d.state,'sent');assert.equal(d.confirmed_wa_id,'synthetic-receipt-late')
    assert.equal((await db.query("select count(*)::int n from whatsapp_messages where wa_message_id='synthetic-receipt-late'")).rows[0].n,1)
  } finally {await db.close()}
})
