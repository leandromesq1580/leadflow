import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
test('poll drains independent of Meta availability and excludes original redeliveries from reconciliation',()=>{
 const source=readFileSync('src/app/api/poll-leads/route.ts','utf8')
 assert.match(source,/await drainAdminNewLeadAssignmentEffects\(/)
 assert.ok(source.indexOf('await drainAdminNewLeadAssignmentEffects(')<source.indexOf('const pageToken'))
 assert.match(source,/\.is\('redelivered_to_lead_id', null\)/)
})
test('durable drain is single-owner, no inline retry after uncertain delivery, and safe effects retry',async()=>{
 assert.ok(existsSync('src/lib/admin-new-lead-assignment-effects.ts'),'durable drain implemented')
 const {drainAdminNewLeadAssignmentEffects}=await import('../src/lib/admin-new-lead-assignment-effects')
 const states:Record<string,string>={notification:'pending',automation:'pending',enrollment:'pending'}
 const calls:string[]=[]
 const ports={
  canNotify:async()=>true,
  rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==='claim_admin_new_lead_effect'){
    const kind=String(args.p_kind)
    if(states[kind]!=='pending')return {data:null,error:null}
    states[kind]='processing';return {data:{id:kind,token:'token',kind,lead_id:'lead',buyer_id:'buyer',stage_id:'stage'},error:null}
   }
   states[String(args.p_id)]=String(args.p_state);return {data:true,error:null}
  },
  notify:async()=>{calls.push('notify');throw new Error('ambiguous transport')},
  automate:async()=>{calls.push('automate')},
  enroll:async()=>{calls.push('enroll')},
 }
 await drainAdminNewLeadAssignmentEffects(ports,1)
 assert.deepEqual(states,{notification:'unknown',automation:'done',enrollment:'done'})
 await drainAdminNewLeadAssignmentEffects(ports,1)
 assert.deepEqual(calls,['notify','enroll','automate'])
 states.notification='pending';ports.canNotify=async()=>false
 await drainAdminNewLeadAssignmentEffects(ports,1)
 assert.equal(states.notification,'pending')
})
