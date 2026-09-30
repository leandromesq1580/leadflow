import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalSender, verifiedSequenceBridge } from '../src/lib/sequence-batch'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import * as config from '../src/lib/ai-sequence-config'
import * as copy from '../src/lib/ai-sequence-copy'
import * as batch from '../src/lib/sequence-batch'
import type { aiEnginePorts } from '../src/lib/ai-sequence-engine'

const ownBridge = { url: 'https://bridge.invalid', key: 'fixture', ownerBuyerId: 'buyer', phone: '15555550100' }
const statusFailures: Record<string, typeof fetch> = {
  timeout: async () => { throw new DOMException('PRIVATE status detail', 'TimeoutError') },
  invalidJSON: async () => new Response('PRIVATE invalid JSON'),
  bodyTimeout: async () => Object.assign(new Response(), { json: async () => { throw new DOMException('PRIVATE body detail', 'TimeoutError') } }),
  network: async () => { throw new TypeError('PRIVATE network detail') },
  unavailable: async () => new Response('PRIVATE unavailable', { status: 503 }),
  notReady: async () => Response.json({ ready: false }),
}
for (const [name, request] of Object.entries(statusFailures)) {
  test(`verified bridge ${name} becomes sanitized SequenceWaiting`, async () => {
    await assert.rejects(verifiedSequenceBridge(ownBridge, request), error => {
      assert.ok(error instanceof SequenceWaiting)
      assert.equal(error.message, 'sequence_waiting')
      assert.equal(error.cause, undefined)
      assert.doesNotMatch(String(error.stack), /PRIVATE/)
      return true
    })
  })
}

// Load the real engine and adapter, replacing only external I/O dependencies.
function realEngineFixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  let generations = 0
  const enrollment = { id: 'e', buyer_id: 'buyer', lead_id: 'lead', sequence_id: 'seq', lease_token: 'token', current_step: 0, recent_choices: [] }
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name === 'claim_ai_sequence' ? [enrollment] : true, error: null }
    },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        single: async () => ({ data: table === 'sequences' ? { ai_config: defaultAIConfig } : { phone: '15555550999', lead_language: 'pt' }, error: null }),
      }
      return query
    },
  }
  const dependencies: Record<string, unknown> = {
    './ai-sequence-config': config,
    './sequence-batch': batch,
    './wa-bridge': { getBridgeForBuyer: async () => ownBridge },
    './send-guard': { checkSendRate: async () => ({ ok: true }) },
    './ai-sequence-copy': { ...copy, generateSequenceCopy: (...args: Parameters<typeof copy.generateSequenceCopy>) => {
      generations++
      return copy.generateSequenceCopy(args[0], args[1], args[2], { key: 'fixture', fetch: async () => Response.json({ error: { message: 'PRIVATE provider detail' } }, { status: 503 }) })
    } },
  }
  const loaded = { exports: {} as { aiEnginePorts: typeof aiEnginePorts; runAIEnrollment: typeof runAIEnrollment } }
  const source = readFileSync(new URL('../src/lib/ai-sequence-engine.ts', import.meta.url), 'utf8')
  new Function('require', 'module', 'exports', transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText)(
    (name: string) => { assert.ok(name in dependencies, name); return dependencies[name] }, loaded, loaded.exports,
  )
  const ports = loaded.exports.aiEnginePorts(db as never)
  ports.now = () => new Date('2026-09-30T15:00:00Z')
  return { calls, generations: () => generations, run: () => loaded.exports.runAIEnrollment('e', ports) }
}
for (const [name, request] of Object.entries(statusFailures)) {
  test(`real engine ${name} waits without defer, generation or transport across repeated claims`, async t => {
    const urls: string[] = []
    t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
      urls.push(String(args[0]))
      return request(...args)
    })
    const engine = realEngineFixture()
    for (let attempt = 0; attempt < 4; attempt++) assert.equal(await engine.run(), false)
    assert.deepEqual(engine.calls.map(call => call.name), Array.from({ length: 4 }, () => ['claim_ai_sequence', 'wait_sequence_batch']).flat())
    for (const call of engine.calls.filter(call => call.name === 'wait_sequence_batch')) {
      assert.equal(call.args.p_reason, 'batch_wait')
      assert.equal(call.args.p_next, '2026-09-30T15:05:00.000Z')
    }
    assert.equal(engine.generations(), 0)
    assert.deepEqual(urls, Array(4).fill('https://bridge.invalid/status'))
  })
}
test('real provider failure still defers as a counted generation failure, never waiting or sending', async t => {
  const urls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url)
    return Response.json({ ready: true, phone: ownBridge.phone })
  })
  const engine = realEngineFixture()
  assert.equal(await engine.run(), false)
  assert.equal(engine.generations(), 1)
  assert.deepEqual(urls, ['https://bridge.invalid/status'])
  assert.deepEqual(engine.calls.map(call => call.name), ['claim_ai_sequence', 'preflight_sequence_batch', 'defer_sequence_batch'])
  assert.equal(engine.calls.at(-1)?.args.p_reason, 'AI_PROVIDER_UNAVAILABLE')
  assert.equal(engine.calls.at(-1)?.args.p_unknown, false)
})
test('sender is status phone, never buyer or URL; missing and divergent identity fail closed',async()=>{
 assert.equal(canonicalSender('+1 (555) 555-0100'),'15555550100')
 for(const value of ['',null,'123','15555550100@g.us'])assert.throws(()=>canonicalSender(value))
 const bridge={url:'http://fixture',key:'fixture',ownerBuyerId:'buyer',phone:'+15555550100'}
 assert.equal((await verifiedSequenceBridge(bridge,async()=>Response.json({ready:true,phone:'15555550100'}))).phone,'15555550100')
 await assert.rejects(verifiedSequenceBridge(bridge,async()=>Response.json({ready:true})))
 await assert.rejects(verifiedSequenceBridge(bridge,async()=>Response.json({ready:true,phone:'15555550200'})))
})

import { runAIEnrollment, type AIEnginePorts } from '../src/lib/ai-sequence-engine'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'
import { SequenceWaiting } from '../src/lib/sequence-batch'
import { runLegacyEnrollment } from '../src/lib/sequence-engine'
test('AI waiting never generates, transports or finishes and is not an unknown failure',async()=>{
 const calls:string[]=[]
 const io:AIEnginePorts={now:()=>new Date('2026-09-30T15:00:00Z'),claim:async()=>({id:'e',buyer_id:'b',lead_id:'l',sequence_id:'s',lease_token:'t',current_step:0,recent_choices:[]}),context:async()=>({config:defaultAIConfig,lead:{lead_language:'pt'},phone:'15555550999'}),ready:async()=>{throw new SequenceWaiting()},generate:async()=>{throw Error('must not generate')},begin:async()=>{throw Error('must not begin')},send:async()=>{throw Error('must not send')},finish:async()=>{throw Error('must not finish')},defer:async(_e,reason,_next,unknown)=>{calls.push(reason);assert.equal(unknown,false)}}
 assert.equal(await runAIEnrollment('e',io),false);assert.deepEqual(calls,['batch_wait'])
})
test('legacy final wait uses one claim and finishes only with granted begin; blocked or cancelled never advances',async()=>{
 for(const allowed of [false,true]){
  const calls:string[]=[]
  const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);if(name==='begin_sequence_batch')assert.equal(args.p_sender,null);return {data:name==='claim_legacy_sequence'?[{id:'e',current_step:0,lease_token:'t'}]:name==='begin_sequence_batch'?{allowed}:true,error:null}},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[{step_type:'wait'}],error:null})})})})}
  assert.equal(await runLegacyEnrollment('e',db as never),allowed)
  assert.deepEqual(calls,allowed?['claim_legacy_sequence','begin_sequence_batch','finish_sequence_batch']:['claim_legacy_sequence','begin_sequence_batch','wait_sequence_batch'])
 }
})
