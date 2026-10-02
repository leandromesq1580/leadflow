import test from 'node:test'
import assert from 'node:assert/strict'
import { sequenceAPI } from '../src/lib/sequence-api'
import { duplicateSequenceDraft } from '../src/lib/sequence-client'
const buyer = '00000000-0000-4000-8000-000000000001'
const stage = '00000000-0000-4000-8000-000000000002'
const request = (body: unknown) => new Request('http://local/api/sequences', {method:'PATCH',body:JSON.stringify(body)})
test('reply destination API forwards omit/null/uuid distinctly and rejects malformed input before RPC', async () => {
 const configs: Record<string,unknown>[] = []
 const api = sequenceAPI({rpc:async (_:string,args:{p_config:Record<string,unknown>}) => {configs.push(args.p_config);return {data:args.p_config,error:null}}} as never,async()=>({id:buyer,isAdmin:false}))
 for (const body of [{name:'Edited'},{reply_stage_id:null},{reply_stage_id:stage}]) assert.equal((await api('save',request(body),buyer)).status,200)
 assert.equal(Object.hasOwn(configs[0],'reply_stage_id'),false)
 assert.equal(configs[1].reply_stage_id,null)
 assert.equal(configs[2].reply_stage_id,stage)
 for (const value of ['', 'invalid', 1, false, {}, []]) assert.equal((await api('save',request({reply_stage_id:value}),buyer)).status,400)
 assert.equal(configs.length,3)
})
test('reply SQL ownership/pipeline errors map to 403/400 without success',async()=>{
 for (const [code,status] of [['42501',403],['22023',400]] as const) {
  const api=sequenceAPI({rpc:async()=>({data:null,error:{code}})} as never,async()=>({id:buyer,isAdmin:true}))
  assert.equal((await api('save',request({reply_stage_id:stage}),buyer)).status,status)
  assert.equal((await api('save',request({buyer_id:stage,reply_stage_id:stage}),buyer)).status,403)
 }
})
test('duplicate explicitly preserves reply destination or disabled NULL without enrollment state',()=>{
 for (const reply_stage_id of [stage,null]) {
  const source={name:'Original',description:null,sequence_steps:[],reply_stage_id}
  const copy=duplicateSequenceDraft(source,'pt')
  assert.equal(copy.reply_stage_id,reply_stage_id)
  assert.equal(copy.enabled,false)
 }
 assert.equal(duplicateSequenceDraft({name:'Old',description:null,sequence_steps:[]},'en').reply_stage_id,null)
})
