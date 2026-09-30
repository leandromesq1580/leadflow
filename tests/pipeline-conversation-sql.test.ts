import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

test('PostgreSQL left lateral top1: scope/status before LIMIT, preserves empty leads, uses versioned lead/date index',async()=>{
 const db=new PGlite()
 try {
  await db.exec(`SET TIME ZONE 'UTC'; CREATE TABLE leads(id int primary key);
   CREATE TABLE whatsapp_messages(id int primary key,lead_id int references leads(id),buyer_id text,direction text,status text,sent_at timestamptz,read_at timestamptz);
   CREATE INDEX idx_wa_msg_lead ON whatsapp_messages(lead_id,sent_at DESC);
   INSERT INTO leads SELECT generate_series(1,50);
   INSERT INTO whatsapp_messages SELECT n,1,'caller','out','sent','2026-01-01'::timestamptz+n*interval '1 second',null FROM generate_series(1,10000) n;
   INSERT INTO whatsapp_messages VALUES(10001,1,'caller','out','failed','2026-09-30',null),(10002,1,'foreign','in','delivered','2026-09-30',null),(10003,1,'caller','out','queued','2026-09-30',null),(10004,1,'caller','out','draft','2026-09-30',null),(10005,1,'caller','other','sent','2026-09-30',null),(10006,1,'caller','in','delivered',null,null),(10007,2,'caller','in','delivered','2026-09-02',null),(10008,2,'caller','out','read','2026-09-01','2026-10-01'); ANALYZE;`)
  // SQL shape used by a PostgREST non-inner embedded resource. PGlite executes
  // actual PostgreSQL; this is NOT a claim that a PostgREST server was exercised.
  const sql=`SELECT l.id,m.sent_at FROM leads l LEFT JOIN LATERAL (
    SELECT sent_at FROM whatsapp_messages w WHERE w.lead_id=l.id AND w.buyer_id='caller'
     AND w.direction IN ('in','out') AND w.status IN ('sent','delivered','read') AND w.sent_at IS NOT NULL
    ORDER BY sent_at DESC NULLS FIRST LIMIT 1
   ) m ON true ORDER BY l.id LIMIT 3`
  const result=await db.query<{id:number;sent_at:string|null}>(sql)
  assert.equal(result.rows.length,3)
  assert.equal(new Date(result.rows[0].sent_at as string).toISOString(),'2026-01-01T02:46:40.000Z')
  assert.equal(new Date(result.rows[1].sent_at as string).toISOString(),'2026-09-02T00:00:00.000Z')
  assert.equal(result.rows[2].sent_at,null)
  const plan=await db.query<{ 'QUERY PLAN': {Plan: Record<string, unknown>}[] }>('EXPLAIN (ANALYZE, FORMAT JSON) '+sql)
  const text=JSON.stringify(plan.rows)
  assert.match(text,/idx_wa_msg_lead/)
  const tree=plan.rows[0]['QUERY PLAN'][0].Plan
  type Plan = Record<string, unknown> & {Plans?: Plan[]}
  const nodes:Plan[]=[];function walk(n:Plan){nodes.push(n);for(const c of n.Plans||[])walk(c)}walk(tree)
  const scan=nodes.find(n=>n['Index Name']==='idx_wa_msg_lead')
  assert.ok(scan);assert.ok(Number(scan['Actual Rows'])<=1)
  assert.ok(!nodes.some(n=>n['Node Type']==='Seq Scan'&&n['Relation Name']==='whatsapp_messages'))
  console.log('SQL offline plan:',JSON.stringify(tree))
 } finally {await db.close()}
})
