import test from 'node:test'
import assert from 'node:assert/strict'
async function gate() {
 const m=await import('../src/lib/pipeline-drag-order')
 assert.equal(typeof m.PipelineDragOrder,'function','drag order gate must exist')
 return new m.PipelineDragOrder()
}
test('freeze ranks during drag; changed dates cannot jump cards; deliberate stage is not snapshotted',async()=>{
 const g=await gate(),before=g.requestVersion()
 const cards=[{id:'b',stage_id:'s'},{id:'a',stage_id:'s'}]
 g.start(cards)
 assert.equal(g.accept(before),false)
 assert.deepEqual(g.sort([{id:'a',stage_id:'new'},{id:'b',stage_id:'s'}]),[{id:'b',stage_id:'s'},{id:'a',stage_id:'new'}])
 assert.equal(g.active,true)
 assert.equal(g.release(),true,'deferred reads need a fresh fetch, not their stale payload')
 assert.equal(g.active,false)
 assert.equal(g.accept(before),false,'late response after release is still stale')
 assert.equal(g.accept(g.requestVersion()),true)
})
test('end/cancel release without deferred refresh, and a second drag invalidates previous response',async()=>{
 const g=await gate();g.start([{id:'a'}]);assert.equal(g.release(),false)
 const version=g.requestVersion();g.start([{id:'b'}]);assert.equal(g.accept(version),false)
 assert.equal(g.release(),true);assert.equal(g.sort([{id:'b'},{id:'a'}]),null)
})
