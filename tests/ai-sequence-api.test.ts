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
test('every sequence operation requires session; admin cannot impersonate other buyer',async()=>{
 const {api}=fixture(null)
 for(const op of ['list','save','remove','enroll','stop','enrollments','preview'] as const) assert.equal((await api(op,request({}),id)).status,401)
 const admin=fixture({id,isAdmin:true})
 assert.equal((await admin.api('list',new Request(`http://local/api/sequences?buyer_id=${other}`))).status,403)
 assert.equal((await admin.api('save',request({buyer_id:other,name:'AI',mode:'ai_until_reply',ai_config:defaultAIConfig,steps:[]}))).status,403)
 assert.equal(admin.calls.length,0)
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
