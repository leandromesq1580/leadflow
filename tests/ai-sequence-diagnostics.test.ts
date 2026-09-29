import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSequenceCopy, AISequenceGenerationError } from '../src/lib/ai-sequence-copy'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'
import { sequenceAPI } from '../src/lib/sequence-api'

const id = '00000000-0000-4000-8000-000000000001'
const secretFixture = 'NEVER_LOG_provider_body_or_key_or_private@example.test'
const request = (ai_config:unknown = defaultAIConfig, locale = 'pt') => new Request('http://local/api/sequences/preview', {
 method:'POST', body:JSON.stringify({ai_config,locale}), headers:{'Content-Type':'application/json'},
})
const reply = (body = 'Você quer uma ligação?') => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({locale:'pt',body})}}]})

test('provider status becomes actionable safe diagnostics with allowlisted metadata and no retry', async(t) => {
 const logs:unknown[][]=[]
 t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args)})
 const cases = [
  [401,{},'AI_PROVIDER_AUTH',503], [403,{},'AI_PROVIDER_FORBIDDEN',503],
  [404,{},'AI_MODEL_UNAVAILABLE',503], [400,{code:'model_not_found'},'AI_MODEL_UNAVAILABLE',503],
  [429,{code:'insufficient_quota'},'AI_QUOTA_EXCEEDED',503],
  [429,{type:'insufficient_quota'},'AI_QUOTA_EXCEEDED',503],
  [429,{code:'rate_limit_exceeded'},'AI_RATE_LIMITED',429],
  [400,{},'AI_PROVIDER_REQUEST',502], [500,{},'AI_PROVIDER_UNAVAILABLE',503],
 ] as const
 for (const [providerStatus,error,code,status] of cases) {
  let count=0
  const api=sequenceAPI({} as never,async()=>({id,isAdmin:false}),(config,lead,recent)=>generateSequenceCopy(config,lead,recent,{key:secretFixture,fetch:async()=>{
   count++
   return Response.json({error:{...error,message:secretFixture}},{status:providerStatus,headers:{'x-request-id':'req_synthetic123'}})
  }}))
  const response=await api('preview',request())
  const result=await response.json()
  assert.equal(response.status,status,code)
  assert.equal(result.code,code)
  assert.equal(result.sent,false)
  assert.equal(count,1)
  assert.match(result.error,/Nenhuma mensagem enviada/)
  assert.doesNotMatch(JSON.stringify(result),/NEVER_LOG|private@example/)
  assert.deepEqual(logs.at(-1),['[ai-sequence-preview]',{code,status,model:defaultAIConfig.model,provider_status:providerStatus,request_id:'req_synthetic123'}])
 }
 assert.doesNotMatch(JSON.stringify(logs),/NEVER_LOG|private@example/)
})

test('malformed JSON, unsafe text, truncation and repetition are typed and never retried', async () => {
 const good = 'Você quer uma ligação?'
 const cases: Array<[() => Response, string[], string]> = [
  [() => new Response(secretFixture), [], 'AI_BAD_JSON'],
  [() => Response.json({choices:[{message:{content:secretFixture}}]}), [], 'AI_BAD_JSON'],
  [() => Response.json({choices:[{message:{content:JSON.stringify({locale:'pt',body:good,extra:true})}}]}), [], 'AI_INVALID_TEXT'],
  [() => reply('Ligue para private@example.test. Você quer uma ligação?'), [], 'AI_INVALID_TEXT'],
  [() => Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify({locale:'pt',body:good})}}]}), [], 'AI_INVALID_TEXT'],
  [() => reply(good), ['draft:v1:'+good], 'AI_REPEATED_TEXT'],
 ]
 for (const [response,recent,code] of cases) {
  let count=0
  await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},recent,{key:'fixture',fetch:async()=>{count++;return response()}}),(error:unknown)=>{
   assert.ok(error instanceof AISequenceGenerationError)
   assert.equal(error.code,code); assert.equal(error.status,502)
   assert.doesNotMatch(error.message,/NEVER_LOG|private@example/)
   return true
  })
  assert.equal(count,1)
 }
})

test('draft rejection exposes only fixed validation reason, never rejected content', async (t) => {
 t.mock.method(console,'error',()=>{})
 const api=sequenceAPI({} as never,async()=>({id,isAdmin:false}),(config,lead,recent)=>generateSequenceCopy(config,lead,recent,{key:'fixture',fetch:async()=>reply('Você quer uma ligação? Você quer conversar?')}))
 const response=await api('preview',request())
 const result=await response.json()
 assert.equal(response.status,502)
 assert.equal(result.code,'AI_INVALID_TEXT')
 assert.equal(result.reason,'question_format')
 assert.equal(result.sent,false)
 assert.doesNotMatch(JSON.stringify(result),/Você quer conversar/)
})

test('body-stream timeout is classified instead of exposing its exception', async () => {
 await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},[],{key:'fixture',fetch:async()=>Object.assign(new Response(),{json:async()=>{throw new DOMException(secretFixture,'TimeoutError')}})}),{code:'AI_TIMEOUT',status:504})
})

test('invalid config, locale and commercial brief return safe input codes before provider',async(t)=>{
 t.mock.method(console,'error',()=>{})
 let count=0
 const api=sequenceAPI({} as never,async()=>({id,isAdmin:false}),(config,lead,recent)=>generateSequenceCopy(config,lead,recent,{key:'fixture',fetch:async()=>{count++;return reply()}}))
 for (const [config,locale,code] of [
  [{...defaultAIConfig,model:secretFixture},'pt','AI_CONFIG_INVALID'],
  [{...defaultAIConfig,repeat_minutes:0},'pt','AI_CONFIG_INVALID'],
  [defaultAIConfig,'unknown','AI_LOCALE_INVALID'],
  [{...defaultAIConfig,brief:secretFixture},'pt','AI_BRIEF_INVALID'],
 ] as const) {
  const response=await api('preview',request(config,locale))
  const result=await response.json()
  assert.equal(response.status,400)
  assert.equal(result.code,code)
  assert.equal(result.sent,false)
  assert.doesNotMatch(result.error,/NEVER_LOG|private@example/)
 }
 assert.equal(count,0)
 await assert.rejects(generateSequenceCopy({...defaultAIConfig,repeat_minutes:0},{lead_language:'pt'},[],{key:'fixture'}),{code:'AI_CONFIG_INVALID'})
 await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'unknown'},[],{key:'fixture'}),{code:'AI_LOCALE_INVALID'})
})

test('unexpected exceptions and unsafe request headers are never exposed by the preview',async(t)=>{
 const logs:unknown[][]=[]
 t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args)})
 const unknown=sequenceAPI({} as never,async()=>({id,isAdmin:false}),async()=>{throw new Error(secretFixture)})
 const result=await unknown('preview',request())
 assert.equal(result.status,503)
 assert.equal((await result.json()).code,'AI_INTERNAL_ERROR')
 const provider=sequenceAPI({} as never,async()=>({id,isAdmin:false}),(config,lead,recent)=>generateSequenceCopy(config,lead,recent,{key:'fixture',fetch:async()=>Response.json({error:{message:secretFixture}},{status:500,headers:{'x-request-id':secretFixture}})}))
 await provider('preview',request())
 assert.deepEqual(logs.at(-1),['[ai-sequence-preview]',{code:'AI_PROVIDER_UNAVAILABLE',status:503,model:defaultAIConfig.model,provider_status:500}])
 assert.doesNotMatch(JSON.stringify(logs),/NEVER_LOG|private@example/)
})

test('network and timeout errors never disclose raw transport details', async () => {
 for (const [error,code,status] of [
  [new TypeError(secretFixture),'AI_NETWORK_ERROR',503],
  [new DOMException(secretFixture,'TimeoutError'),'AI_TIMEOUT',504],
  [new DOMException(secretFixture,'AbortError'),'AI_TIMEOUT',504],
 ] as const) {
  let count=0
  await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},[],{key:'fixture',fetch:async()=>{count++;throw error}}), (error:unknown) => {
   assert.ok(error instanceof AISequenceGenerationError)
   assert.equal(error.code,code); assert.equal(error.status,status)
   assert.doesNotMatch(error.message,/NEVER_LOG/)
   return true
  })
  assert.equal(count,1)
 }
})
