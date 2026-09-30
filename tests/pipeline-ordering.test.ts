import test from 'node:test'
import assert from 'node:assert/strict'

async function ordering() {
  const orderingModule = await import('../src/lib/pipeline-ordering')
  assert.equal(typeof orderingModule.orderPipelineCards, 'function', 'pipeline ordering must exist')
  return orderingModule.orderPipelineCards
}
const card = (id: string, created_at: string | null) => ({id, stage_id:'s', lead:{id,created_at}})
test('newest sorts by lead creation, deterministic IDs, invalid dates last without mutation', async () => {
  const order = await ordering()
  const cards = [card('z',null),card('b','2026-09-01'),card('a','2026-09-01'),card('c','invalid'),card('d','2026-09-02')]
  assert.deepEqual(order(cards,'newest',{}).map(c=>c.id),['d','a','b','c','z'])
  assert.equal(cards[0].id,'z')
})
test('recent WhatsApp first, then creation and IDs; unknown/invalid conversation dates below, newest first', async () => {
 const order=await ordering()
 const cards=[card('a','2026-09-03'),card('b','2026-09-02'),card('c','2026-09-01'),card('d','2026-09-02'),card('e','2026-09-02')]
 assert.deepEqual(order(cards,'conversation',{c:'2026-09-10',b:'2026-09-10',a:'bad',e:null}).map(c=>c.id),['b','c','a','d','e'])
})
