import test from 'node:test'
import assert from 'node:assert/strict'
import { sequenceAPI } from '../src/lib/sequence-api'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'
const id='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
function fixture(caller:{id:string;isAdmin:boolean}|null){
 const calls:unknown[]=[]
 const db={from:()=>{throw Error('Unexpected DB call')},rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:{id},error:null}}}
 const api=sequenceAPI(db as never,async()=>caller,async()=>({body:'Preview IA',choice:'0:0'}))
 return {api,calls}
}
const request=(body:unknown)=>new Request('http://local/api/sequences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('minute intervals survive save and preview; invalid durations never reach storage', async(t) => {
 t.mock.method(console, 'error', () => {})
 const writes: Array<{p_config:{ai_config:typeof defaultAIConfig}}> = []
 const db = {rpc: async(_name:string, args:typeof writes[number]) => { writes.push(args); return {data:args.p_config,error:null} }}
 let received = 0
 const api = sequenceAPI(db as never, async()=>({id,isAdmin:false}), async(config)=>{received=config.repeat_minutes;return {body:'Fixture',choice:'fixture'}})
 for (const repeat_minutes of [1,10,59,60,1440,43200]) {
  const config = {...defaultAIConfig,repeat_minutes,initial_delay_minutes:0,start:'09:17',end:'18:23'}
  const result = await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:config}))
  assert.equal(result.status,200, `${repeat_minutes} minutes accepted`)
  assert.deepEqual((await result.json()).sequence.ai_config,config)
  assert.equal((await api('preview',request({ai_config:config,locale:'pt'}))).status,200)
  assert.equal(received,repeat_minutes)
 }
 for (const repeat_minutes of [0,-1,NaN,Infinity,0.5,10.5,43201,null,'10']) {
  for (const op of ['save','preview'] as const) assert.equal((await api(op,request({name:'AI',mode:'ai_until_reply',locale:'pt',ai_config:{...defaultAIConfig,repeat_minutes}}))).status,400)
 }
 assert.equal(writes.length,6)
 assert.equal(defaultAIConfig.repeat_minutes,1440)
})

test('every sequence operation requires session; admin cannot impersonate other buyer',async()=>{
 const {api}=fixture(null)
 for(const op of ['list','save','remove','enroll','stop','enrollments','preview'] as const) assert.equal((await api(op,request({}),id)).status,401)
 const admin=fixture({id,isAdmin:true})
 assert.equal((await admin.api('list',new Request(`http://local/api/sequences?buyer_id=${other}`))).status,403)
 assert.equal((await admin.api('save',request({buyer_id:other,name:'AI',mode:'ai_until_reply',ai_config:defaultAIConfig,steps:[]}))).status,403)
 assert.equal(admin.calls.length,0)
})
test('preview reports missing provider configuration safely instead of an opaque 503',async(t)=>{
 const { generateSequenceCopy } = await import('../src/lib/ai-sequence-copy')
 const logs:unknown[][]=[]
 t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args)})
 const api=sequenceAPI({} as never,async()=>({id,isAdmin:false}),(config,lead,recent)=>generateSequenceCopy(config,lead,recent,{key:''}))
 const result=await api('preview',request({ai_config:defaultAIConfig,locale:'pt'}))
 assert.equal(result.status,503)
 const body=await result.json()
 assert.equal(body.code,'AI_KEY_MISSING')
 assert.match(body.error,/administrador/)
 assert.equal(body.sent,false)
 assert.equal(logs.length,1)
 assert.deepEqual(logs[0],["[ai-sequence-preview]",{code:'AI_KEY_MISSING',status:503,model:'gpt-6.1-sol'}])
})

test('save preserves model in JSONB payload and preview uses the saved selection; legacy remains compatible',async()=>{
 for (const model of ['gpt-6.1-sol','gpt-6-astra','gpt-6-luna','gpt-4o-mini',undefined] as const) {
  const calls: Array<{p_config:{ai_config:unknown}}> = []
  const db={rpc:async(_name:string,args:{p_config:{ai_config:unknown}})=>{calls.push(args);return {data:args.p_config,error:null}}}
  let selected:unknown
  const api=sequenceAPI(db as never,async()=>({id,isAdmin:false}),async(config)=>{selected=config.model;return {body:'Preview IA',choice:'fixture'}})
  const saved=await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:{...defaultAIConfig,model}}))
  assert.equal(saved.status,200)
  const config=(await saved.json()).sequence.ai_config
  assert.equal(config.model,model ?? 'gpt-4o-mini')
  assert.deepEqual(calls[0].p_config.ai_config,config)
  assert.equal((await api('preview',request({ai_config:config,locale:'pt'}))).status,200)
  assert.equal(selected,model ?? 'gpt-4o-mini')
  const invalid=await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:{...config,model:'arbitrary'}}))
  assert.equal(invalid.status,400);assert.equal((await invalid.json()).code,'AI_CONFIG_INVALID')
  assert.equal(calls.length,1)
 }
})

test('presentation survives save and preview independently per sequence; invalid input never reaches storage',async(t)=>{
 t.mock.method(console,'error',()=>{})
 const writes:Array<{p_buyer:string;p_config:{ai_config:{presentation:string}}}>=[]
 const db={rpc:async(_name:string,args:typeof writes[number])=>{writes.push(args);return {data:args.p_config,error:null}}}
 let received=''
 const api=sequenceAPI(db as never,async()=>({id,isAdmin:false}),async(config)=>{received=config.presentation ?? '';return {body:'Fixture local',choice:'fixture'}})
 for(const presentation of ['Oi, sou Ana, agente de life insurance.','Prefiro uma abertura breve e direta.','']){
  const saved=await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:{...defaultAIConfig,presentation:` ${presentation} `}}))
  assert.equal(saved.status,200)
  const config=(await saved.json()).sequence.ai_config
  assert.equal(config.presentation,presentation)
  const preview=await api('preview',request({ai_config:config,locale:'pt'}))
  assert.equal(preview.status,200);assert.equal((await preview.json()).sent,false)
  assert.equal(received,presentation)
 }
 assert.deepEqual(writes.map(value=>value.p_config.ai_config.presentation),['Oi, sou Ana, agente de life insurance.','Prefiro uma abertura breve e direta.',''])
 assert.ok(writes.every(value=>value.p_buyer===id))
 for(const presentation of [null,42,{},'x'.repeat(301)]){
  for(const op of ['save','preview'] as const){
   const invalid=await api(op,request({name:'AI',mode:'ai_until_reply',locale:'pt',ai_config:{...defaultAIConfig,presentation}}))
   assert.equal(invalid.status,400)
  }
 }
 assert.equal((await api('preview',request({buyer_id:other,locale:'pt',ai_config:{...defaultAIConfig,presentation:'Outro agente'}}))).status,403)
 assert.equal(writes.length,3)
})

test('instructions survives save and preview independently per sequence; invalid input never reaches storage',async(t)=>{
 t.mock.method(console,'error',()=>{})
 const writes:Array<{p_buyer:string;p_config:{ai_config:{instructions:string}}}>=[]
 const db={rpc:async(_name:string,args:typeof writes[number])=>{writes.push(args);return {data:args.p_config,error:null}}}
 let received=''
 const api=sequenceAPI(db as never,async()=>({id,isAdmin:false}),async(config)=>{received=config.instructions ?? '';return {body:'Fixture local',choice:'fixture'}})
 for(const instructions of [('1. Explique como funciona.\nNão peça dados de saúde. '.repeat(8)).trim(),'Prefiro uma abertura breve e direta.','']){
  const saved=await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:{...defaultAIConfig,instructions:` ${instructions} `}}))
  assert.equal(saved.status,200)
  const config=(await saved.json()).sequence.ai_config
  assert.equal(config.instructions,instructions)
  const preview=await api('preview',request({ai_config:config,locale:'pt'}))
  assert.equal(preview.status,200);assert.equal((await preview.json()).sent,false)
  assert.equal(received,instructions)
 }
 assert.deepEqual(writes.map(value=>value.p_config.ai_config.instructions),[('1. Explique como funciona.\nNão peça dados de saúde. '.repeat(8)).trim(),'Prefiro uma abertura breve e direta.',''])
 assert.ok(writes.every(value=>value.p_buyer===id))
 for(const instructions of [null,42,{},'x'.repeat(6001)]){
  for(const op of ['save','preview'] as const){
   const invalid=await api(op,request({name:'AI',mode:'ai_until_reply',locale:'pt',ai_config:{...defaultAIConfig,instructions}}))
   assert.equal(invalid.status,400)
  }
 }
 assert.equal((await api('preview',request({buyer_id:other,locale:'pt',ai_config:{...defaultAIConfig,instructions:'Outro agente'}}))).status,403)
 assert.equal(writes.length,3)
})

test('AI config errors return 400; create and preview use session identity and never transport',async()=>{
 const {api,calls}=fixture({id,isAdmin:false})
 assert.equal((await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:{...defaultAIConfig,repeat_minutes:0}}))).status,400)
 assert.equal((await api('save',request({name:'Legacy',steps:[],trigger_stage_id:''}))).status,400)
 assert.equal((await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:defaultAIConfig,trigger_stage_id:'',steps:[]}))).status,400)
 const saved=await api('save',request({name:'AI',mode:'ai_until_reply',ai_config:defaultAIConfig,steps:[]}))
 assert.equal(saved.status,200)
 assert.equal((calls[0] as {args:{p_buyer:string}}).args.p_buyer,id)
 const preview=await api('preview',request({ai_config:defaultAIConfig,locale:'es'}))
 assert.equal(preview.status,200);assert.equal(calls.length,1)
 assert.equal((await preview.json()).sent,false)
})
