/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase I/O fixture. */
import test from 'node:test'
import assert from 'node:assert/strict'

const buyer = '11111111-1111-4111-8111-111111111111'
const pipeline = '22222222-2222-4222-8222-222222222222'
const stage = '33333333-3333-4333-8333-333333333333'
async function api() {
  const loaded = await import('../src/lib/pipeline-stage-actions-api').catch(() => ({} as any))
  assert.equal(typeof loaded.stageActionsAPI, 'function', 'authenticated stage metadata API must exist')
  return loaded.stageActionsAPI
}
function fixture(tables: Record<string, any[]> = {}, fail = '') {
  const calls: any[] = []
  const db = { from(table: string) {
    const ops: any[] = []; calls.push({table, ops})
    const chain: any = new Proxy({}, {get: (_, key) => key === 'then' ? (resolve: any) => {
      let rows = structuredClone(tables[table] || [])
      for (const [op, col, val] of ops) {
        const get = (r: any) => col.includes('->>') ? r[col.split('->>')[0]]?.[col.split('->>')[1]] : r[col]
        if (op === 'eq') rows = rows.filter(r => get(r) === val)
        if (op === 'in') rows = rows.filter(r => val.includes(get(r)))
        if (op === 'range') rows = rows.slice(col, val + 1)
      }
      resolve({data: ops.some(o => o[0] === 'maybeSingle') ? rows[0] || null : rows, error: (table === fail || (fail===`${table}:later` && ops.some(o=>o[0]==='range'&&o[1]>0))) ? {message:'secret fixture'} : null})
    } : (...args: any[]) => { assert.ok(!['insert','update','delete','rpc'].includes(String(key))); ops.push([key,...args]); return chain }})
    return chain
  }}
  return {db, calls}
}
const owned = { pipelines: [{id:pipeline, buyer_id:buyer}], pipeline_stages:[{id:stage, pipeline_id:pipeline}] }
const request = (query = `pipeline_id=${pipeline}`) => new Request(`http://fixture.invalid/api/pipeline/stage-actions?${query}`)
test('metadata requires caller identity before any database read', async () => {
  const create = await api(); const f = fixture()
  const response = await create(f.db, async () => null)(request())
  assert.equal(response.status, 401); assert.equal(f.calls.length, 0)
})
test('exact owner only, even admin/agency: foreign or malformed pipelines expose nothing', async () => {
  const create = await api()
  for (const isAdmin of [false,true]) {
    const f = fixture(owned)
    const r = await create(f.db,async()=>({id:'another',isAdmin}))(request())
    assert.equal(r.status,403); assert.ok(!f.calls.some(c=>['sequences','automations'].includes(c.table)))
  }
  const f = fixture(owned)
  assert.equal((await create(f.db,async()=>({id:buyer,isAdmin:false}))(request('pipeline_id=bad'))).status,400)
  assert.equal(f.calls.length,0)
})
test('minimal metadata uses enabled and trigger stage, never destination or global rules; ignores buyer_id', async () => {
  const create = await api()
  const f = fixture({...owned, sequences:[
    {id:'seq',buyer_id:buyer,name:'Sequence',enabled:false,trigger_stage_id:stage,ai_config:{secret:true}},
    {id:'foreign',buyer_id:'another',name:'Hidden',enabled:true,trigger_stage_id:stage},
    {id:'global',buyer_id:buyer,trigger_stage_id:null}], automations:[
    {id:'a',buyer_id:buyer,name:'Active',enabled:true,trigger_type:'stage_entered',trigger_config:{stage_id:stage},action_config:{secret:true}},
    {id:'b',buyer_id:buyer,name:'Inactive',enabled:false,trigger_type:'stage_stale',trigger_config:{stage_id:stage}},
    {id:'destination',buyer_id:buyer,enabled:true,trigger_type:'stage_entered',trigger_config:{stage_id:'elsewhere'},action_config:{target_stage_id:stage}},
    {id:'other-trigger',buyer_id:buyer,enabled:true,trigger_type:'no_response',trigger_config:{stage_id:stage}},
    {id:'global',buyer_id:buyer,enabled:true,trigger_type:'stage_entered',trigger_config:{}},
    {id:'foreign',buyer_id:'another',enabled:true,trigger_type:'stage_entered',trigger_config:{stage_id:stage}}]})
  const r = await create(f.db,async()=>({id:buyer,isAdmin:false}))(request(`pipeline_id=${pipeline}&buyer_id=another`))
  assert.equal(r.status,200); assert.match(r.headers.get('Cache-Control'),/no-store/)
  assert.deepEqual(await r.json(),{pipeline_id:pipeline,stages:[{id:stage,sequences:[{id:'seq',name:'Sequence',enabled:false}],automations:[{id:'a',name:'Active',enabled:true},{id:'b',name:'Inactive',enabled:false}]}]})
  for (const c of f.calls.filter(c=>['sequences','automations'].includes(c.table))) {
    assert.ok(c.ops.some((o: unknown[])=>o[0]==='eq'&&o[1]==='buyer_id'&&o[2]===buyer))
    assert.ok(c.ops.some((o: unknown[])=>o[0]==='in'&&o[1]===(c.table==='sequences'?'trigger_stage_id':'trigger_config->>stage_id')))
  }
})
test('database errors never become an empty success; paginates exact counts', async () => {
  const create = await api()
  for (const table of ['pipelines','pipeline_stages','sequences','automations']) {
    const f = fixture(owned,table)
    const r = await create(f.db,async()=>({id:buyer,isAdmin:false}))(request())
    assert.equal(r.status,503); assert.ok(!(await r.text()).includes('secret fixture'))
  }
  const f = fixture({...owned,sequences:Array.from({length:205},(_,i)=>({id:String(i),name:'S',buyer_id:buyer,enabled:true,trigger_stage_id:stage}))})
  const r = await create(f.db,async()=>({id:buyer,isAdmin:false}))(request())
  assert.equal((await r.json()).stages[0].sequences.length,205)
  assert.ok(f.calls.filter(c=>c.table==='sequences').length>1)
  const late = fixture({...owned,sequences:Array.from({length:205},(_,i)=>({id:String(i),name:'S',buyer_id:buyer,enabled:true,trigger_stage_id:stage}))},'sequences:later')
  const failed = await create(late.db,async()=>({id:buyer,isAdmin:false}))(request())
  assert.equal(failed.status,503);assert.equal((await failed.json()).stages,undefined)
  const empty = fixture(owned)
  const emptyResponse = await create(empty.db,async()=>({id:buyer,isAdmin:false}))(request())
  assert.deepEqual((await emptyResponse.json()).stages,[{id:stage,sequences:[],automations:[]}])
})
