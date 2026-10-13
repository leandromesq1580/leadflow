const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load(fetch, signals) {
  const box = { exports: {}, require: () => { throw Error('unexpected dependency') }, fetch, AbortSignal: {
    timeout(ms) { signals.push(ms); const c = new AbortController(); setTimeout(() => c.abort(), ms / 1000).unref(); return c.signal },
  }, setTimeout, console }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sequence-batch.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, box)
  return box.exports
}
const sender = '18635550123'
const op = { id: 'synthetic-enrollment', lease_token: 'synthetic-operation', current_step: 0 }
const bridge = { url: 'http://synthetic.invalid', apiKey: 'synthetic', phone: sender }
test('same operation confirmation arriving after 20 seconds succeeds without replay', async () => {
  let posts = 0; const signals = []
  const m = load(async (_, init) => {
    posts++
    return await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Error('timeout')))
      setTimeout(() => resolve({ status: 200, json: async () => ({ success: true, id: 'synthetic-late', sequence: {
        version: 2, operation_id: op.lease_token, sender, outcome: 'confirmed',
      } }) }), 22)
    })
  }, signals)
  const id = await m.sendSequenceMessage(bridge, op, '19145550123', 'synthetic body', async () => true, 20000)
  assert.equal(id, 'synthetic-late'); assert.equal(posts, 1)
  assert.equal(signals[0], 75000)
})

test('confirmation persistence retries the same receipt, never transport', async () => {
  const m=load(async()=>{throw Error('transport must not be invoked')},[])
  assert.equal(typeof m.persistSequenceConfirmation,'function')
  const calls=[];const args={p_id:'synthetic-id',p_token:'synthetic-op',p_wa:'synthetic-receipt'}
  await m.persistSequenceConfirmation(async(name,value)=>{
    calls.push({name,value})
    if(calls.length<3)throw Error('temporary storage outage')
    return true
  },args)
  assert.equal(calls.length,3)
  assert.equal(calls[0].name,'finish_sequence_batch')
  assert.equal(calls[1].name,'confirm_sequence_delivery')
  assert.equal(calls[2].name,'confirm_sequence_delivery')
  assert.ok(calls.every(c=>c.value===args))
})
test('confirmation attempts remain bounded and fail closed when no receipt is persisted', async()=>{
  const m=load(async()=>{throw Error('no transport')},[])
  assert.equal(typeof m.persistSequenceConfirmation,'function')
  let attempts=0
  await assert.rejects(m.persistSequenceConfirmation(async()=>{attempts++;throw Error('offline')},{}))
  assert.equal(attempts,4)
})
