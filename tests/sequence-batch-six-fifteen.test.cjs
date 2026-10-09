// Synthetic transition proof: real SQL on PostgreSQL/WASM, no .env or external DB.
// PGlite has one session; multi-connection races live in sequence-batch-pg-concurrency.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID: uuid } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const transition = '060_sequence_six_per_fifteen.sql';
const B = '11111111-1111-1111-1111-111111111111';
const O = '22222222-2222-2222-2222-222222222222';

const sender = '15550001001';
const query = async (db, sql, args = []) => (await db.query(sql, args)).rows;

async function setup(t, migrated = true) {
  // Reuse the existing harness's schema literally instead of maintaining a second fixture.
  const source = fs.readFileSync(path.join(__dirname, 'sequence-batch-sql.test.cjs'), 'utf8');
  const fixture = source.match(/await db\.exec\(`([\s\S]*?)`\)/);
  assert.ok(fixture, 'existing SQL harness must expose its synthetic schema fixture');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixture[1]);
  await db.exec(read('006_inbox_sequences_ai_push.sql').split('-- AI LEAD SCORING')[0]);
  for (const name of [
    '052_ai_sequences_until_reply.sql', '053_ai_suppression_resolution.sql',
    '054_sequence_batch_pacing.sql', '055_sequence_batch_completion_clock.sql',
    '056_sequence_reply_stage.sql', '058_sequence_proven_rejection.sql',
  ]) await db.exec(read(name));
  await query(db, 'INSERT INTO buyers(id) VALUES($1),($2)', [B, O]);
  if (migrated) await db.exec(read(transition));
  return db;
}

async function enrollment(db, ai = false) {
  const lead = uuid(), seq = uuid();
  const buyer = ai ? O : B;
  await query(db, 'INSERT INTO leads(id,assigned_to) VALUES($1,$2)', [lead, buyer]);
  await query(db, `INSERT INTO sequences(id,buyer_id,name,enabled,mode,ai_config)
    VALUES($1,$2,'synthetic',true,$3,$4)`, [seq, buyer, ai ? 'ai_until_reply' : 'legacy',
    { timezone: 'UTC', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }]);
  if (!ai) await query(db, `INSERT INTO sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body)
    VALUES($1,0,0,'send_template','synthetic'),($1,1,1,'send_template','synthetic')`, [seq]);
  const [e] = await query(db, "SELECT * FROM enroll_sequence($1,$2,$3,clock_timestamp()-interval '1 minute')", [buyer, seq, lead]);
  const [claimed] = await query(db, `SELECT * FROM ${ai ? 'claim_ai_sequence' : 'claim_legacy_sequence'}($1)`, [e.id]);
  assert.ok(claimed, 'synthetic enrollment must be claimable');
  return { id: claimed.id, token: claimed.lease_token };
}
const begin = async (db, e, number = sender) => (await query(db,
  "SELECT begin_sequence_batch($1,$2,$3,'synthetic') AS r", [e.id, e.token, number]))[0].r.allowed;
async function finish(db, e) {
  const [dispatch] = await query(db, 'SELECT sender FROM sequence_batch_dispatches WHERE token=$1', [e.token]);
  return (await query(db,
    "SELECT finish_sequence_batch($1,$2,$3,'',clock_timestamp()+interval '1 day',$4,'15550001999') AS ok",
    [e.id, e.token, `synthetic-ack-${e.id}`, dispatch.sender]))[0].ok;
}
const batch = async (db, number = sender) => (await query(db,
  'SELECT * FROM sequence_sender_batches WHERE sender=$1', [number]))[0];
const snapshot = (db, table) => query(db, `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`);
async function reject(db,e) {
  const [row]=await query(db,'select enrolled_at,current_step from sequence_enrollments where id=$1',[e.id]);
  const [dispatch]=await query(db,'select sender from sequence_batch_dispatches where token=$1',[e.token]);
  return (await query(db,'select reject_sequence_batch($1,$2,$3,$4,$5,$6) ok',
    [e.id,e.token,row.enrolled_at,row.current_step,dispatch.sender,{version:2,operation_id:e.token,sender:dispatch.sender,outcome:'rejected_before_send',code:'bridge_not_ready'}]))[0].ok;
}

test('060 last proven rejection keeps the reserved slot and extends the full cooldown from settlement',async(t)=>{
 const db=await setup(t), members=[];
 for(let i=0;i<6;i++){const e=await enrollment(db,i%2===1);assert.equal(await begin(db,e),true);members.push(e)}
 for(const e of members.slice(0,-1))assert.equal(await finish(db,e),true);
 await new Promise(r=>setTimeout(r,25));
 const final=members.at(-1);assert.equal(await reject(db,final),true);
 const b=await batch(db);
 assert.equal(b.used,6);
 assert.ok(+new Date(b.cooldown_until)-+new Date(b.last_settled_at)>=900000-2,'last rejection must start a complete fifteen-minute pause');
 const [state]=await query(db,'select status,delivery_status,current_step,lease_token from sequence_enrollments where id=$1',[final.id]);
 assert.deepEqual(state,{status:'paused',delivery_status:'rejected_before_send',current_step:0,lease_token:null});
 assert.equal(await reject(db,final),true);assert.deepEqual(await batch(db),b);
 assert.equal(await begin(db,await enrollment(db)),false);
 await ageBatch(db,sender,901,true);assert.equal(await begin(db,await enrollment(db)),true);
});

test('060 migrated in-flight batches 1..5 and historical 7..10 preserve counts and extend cooldown for every terminal path',async(t)=>{
 const db=await setup(t,false), cases=[];
 for(const count of [1,2,3,4,5,7,8,9,10])for(const terminal of ['sent','rejected_before_send','unknown']){
  const number='15550003'+String(cases.length).padStart(3,'0'),members=[];
  for(let i=0;i<count;i++){const e=await enrollment(db,i%2===1);assert.equal(await begin(db,e,number),true);members.push(e)}
  for(const e of members.slice(0,-1))assert.equal(await finish(db,e),true);
  cases.push({count,terminal,number,last:members.at(-1)});
 }
 await db.exec(read(transition));
 await new Promise(r=>setTimeout(r,25));
 for(const c of cases){
  assert.equal((await batch(db,c.number)).used,c.count);
  if(c.terminal==='sent')assert.equal(await finish(db,c.last),true);
  else if(c.terminal==='rejected_before_send')assert.equal(await reject(db,c.last),true);
  else await query(db,"select defer_sequence_batch($1,$2,'delivery_unknown',clock_timestamp(),true)",[c.last.id,c.last.token]);
  const b=await batch(db,c.number);
  assert.equal(b.used,c.count,'terminal settlement must never return reserved capacity');
  assert.ok(+new Date(b.cooldown_until)-+new Date(b.last_settled_at)>=900000-2,`${c.count}/${c.terminal}: complete pause after final settlement`);
  const [d]=await query(db,'select state from sequence_batch_dispatches where token=$1',[c.last.token]);
  assert.equal(d.state,c.terminal);
  assert.equal(await begin(db,await enrollment(db),c.number),false);
  await ageBatch(db,c.number,901,true);
  const allowed=await begin(db,await enrollment(db),c.number);
  assert.equal(allowed,c.terminal!=='unknown');
  assert.equal((await batch(db,c.number)).used,c.terminal==='unknown'?c.count:1);
 }
});

async function ageBatch(db, number, settledSeconds, cooldownExpired = false) {
  await query(db, `UPDATE sequence_sender_batches
    SET last_reserved_at=clock_timestamp()-interval '1 day',
        last_settled_at=clock_timestamp()-($2 * interval '1 second'),
        cooldown_until=CASE WHEN $3 THEN clock_timestamp()-interval '1 second' ELSE NULL END
    WHERE sender=$1`, [number, settledSeconds, cooldownExpired]);
}

async function legacyBatch(db, number, used, unknown = false) {
  const members = [];
  for (let i = 0; i < used; i++) {
    const e = await enrollment(db, i % 2 === 1);
    assert.equal(await begin(db, e, number), true, 'legacy fixture must actually reserve capacity');
    members.push(e);
  }
  for (const [i, e] of members.entries()) {
    if (unknown && i === members.length - 1) {
      await query(db, "SELECT defer_sequence_batch($1,$2,'synthetic_lost',clock_timestamp(),false)", [e.id, e.token]);
    } else assert.equal(await finish(db, e), true);
  }
  return members;
}

test('060 preserves legacy used=10, partial and unknown state while extending cooldown conservatively', async (t) => {
  const db = await setup(t, false);
  const full = '15550001010', partial = '15550001003', unknown = '15550001009';
  const recentReservation = '15550001004', idle = '15550001000';
  await legacyBatch(db, full, 10);
  await legacyBatch(db, partial, 3);
  const [uncertain] = await legacyBatch(db, unknown, 1, true);
  await legacyBatch(db, recentReservation, 2);
  // Distinct maxima prove all three conservative cooldown floors, not just now+15.
  await ageBatch(db, full, 1200, true);
  await query(db, "UPDATE sequence_sender_batches SET cooldown_until=clock_timestamp()+interval '30 minutes' WHERE sender=$1", [full]);
  await ageBatch(db, partial, 1200);
  await query(db, "UPDATE sequence_sender_batches SET last_settled_at=clock_timestamp()+interval '5 minutes' WHERE sender=$1", [partial]);
  await ageBatch(db, unknown, 86400, true);
  await ageBatch(db, recentReservation, 1200);
  await query(db, "UPDATE sequence_sender_batches SET last_reserved_at=clock_timestamp()+interval '3 minutes' WHERE sender=$1", [recentReservation]);
  await query(db, "INSERT INTO sequence_sender_batches(sender,used,cooldown_until) VALUES($1,0,clock_timestamp()+interval '5 minutes')", [idle]);
  // Keep active/sending, paused and stopped enrollments with non-default leases/attempts.
  const flying = await enrollment(db, true);
  assert.equal(await begin(db, flying, '15550001008'), true);
  for (const status of ['paused', 'stopped']) {
    const e = await enrollment(db);
    await query(db, 'UPDATE sequence_enrollments SET status=$2,attempts=3,stop_reason=$3 WHERE id=$1', [e.id, status, `synthetic_${status}`]);
  }
  const tables = ['sequence_enrollments', 'sequence_batch_dispatches', 'ai_sequence_suppressions', 'whatsapp_messages'];
  const before = {};
  for (const table of tables) before[table] = await snapshot(db, table);
  const oldBatches = await query(db, 'SELECT * FROM sequence_sender_batches ORDER BY sender');
  const lower = Number((await query(db, 'SELECT extract(epoch FROM clock_timestamp()) AS n'))[0].n);
  await db.exec(read(transition));
  const upper = Number((await query(db, 'SELECT extract(epoch FROM clock_timestamp()) AS n'))[0].n);
  for (const table of tables) assert.deepEqual(await snapshot(db, table), before[table], `${table} must be unchanged`);
  const newBatches = await query(db, 'SELECT * FROM sequence_sender_batches ORDER BY sender');
  assert.equal(newBatches.length, oldBatches.length);
  for (let i = 0; i < oldBatches.length; i++) {
    const old = oldBatches[i], current = newBatches[i];
    const { cooldown_until: oldCooldown, ...oldOther } = old;
    const { cooldown_until: currentCooldown, ...currentOther } = current;
    assert.deepEqual(currentOther, oldOther, 'migration must not reset used or rewrite sender clocks');
    if (!old.used) assert.deepEqual(current, old, 'unused sender must not be touched');
    else {
      const inflightFloors=before.sequence_batch_dispatches.map(x=>x.row)
        .filter(d=>d.sender===old.sender&&d.state==='sending').map(d=>+new Date(d.expires_at)/1000+900);
      const historicalFloor = Math.max(oldCooldown ? +new Date(oldCooldown) / 1000 : -Infinity,
        +new Date(old.last_reserved_at) / 1000 + 900, +new Date(old.last_settled_at) / 1000 + 900,
        ...inflightFloors);
      const actual = +new Date(currentCooldown) / 1000;
      assert.ok(actual >= Math.max(historicalFloor, lower + 900) - 0.002, `${old.sender}: conservative floor`);
      assert.ok(actual <= Math.max(historicalFloor, upper + 900) + 0.002, `${old.sender}: expected greatest floor`);
    }
  }
  assert.equal((await batch(db, full)).used, 10, 'historical used=10 remains constraint-compatible');
  assert.equal((await batch(db, partial)).used, 3);
  assert.equal((await query(db, 'SELECT state FROM sequence_batch_dispatches WHERE token=$1', [uncertain.token]))[0].state, 'unknown');
  for (const number of [full, partial, recentReservation]) {
    const e = await enrollment(db, true);
    assert.equal((await query(db, 'SELECT preflight_sequence_batch($1,$2,$3) AS ok', [e.id, e.token, number]))[0].ok, false);
    const row = (await query(db, 'SELECT status,attempts,lease_token FROM sequence_enrollments WHERE id=$1', [e.id]))[0];
    assert.deepEqual(row, { status: 'active', attempts: 0, lease_token: null });
    assert.equal((await batch(db, number)).used, number === full ? 10 : number === partial ? 3 : 2);
  }
  // Even after a synthetic day, unknown retains capacity and is never auto-released.
  await ageBatch(db, unknown, 86400, true);
  const ledger = await snapshot(db, 'sequence_batch_dispatches');
  assert.equal(await begin(db, await enrollment(db), unknown), false);
  const preflight = await enrollment(db, true);
  assert.equal((await query(db, 'SELECT preflight_sequence_batch($1,$2,$3) AS ok', [preflight.id, preflight.token, unknown]))[0].ok, false);
  assert.equal((await query(db, 'SELECT expire_sequence_batch_dispatches($1) AS n', [unknown]))[0].n, 0);
  assert.equal((await batch(db, unknown)).used, 1);
  assert.deepEqual(await snapshot(db, 'sequence_batch_dispatches'), ledger);
  // A resolved historical full batch resets only after its extended cooldown expires.
  await ageBatch(db, full, 901, true);
  assert.equal(await begin(db, await enrollment(db), full), true);
  assert.equal((await batch(db, full)).used, 1);
});

test('060 grants six shared sender admissions and pauses fifteen minutes after the final completion', async (t) => {
  const db = await setup(t);
  const members = [];
  for (let i = 0; i < 6; i++) {
    const e = await enrollment(db, i % 2 === 1);
    assert.equal(await begin(db, e), true);
    members.push(e);
  }
  assert.equal((await batch(db)).used, 6);
  assert.equal(await begin(db, await enrollment(db)), false, 'seventh admission is forbidden');
  const reservedCooldown = (await batch(db)).cooldown_until;
  for (const e of members.slice(0, -1)) assert.equal(await finish(db, e), true);
  assert.ok(+new Date((await batch(db)).cooldown_until) >= +new Date(reservedCooldown),
    'intermediate completion cannot shorten cooldown');
  await query(db, "UPDATE sequence_sender_batches SET cooldown_until=clock_timestamp()-interval '1 second' WHERE sender=$1", [sender]);
  assert.equal(await begin(db, await enrollment(db)), false, 'in-flight dispatch still blocks reset');
  assert.equal(await finish(db, members.at(-1)), true);
  const settled = await batch(db);
  assert.ok(+new Date(settled.cooldown_until) - +new Date(settled.last_settled_at) >= 900000 - 2,
    'cooldown must run from final completion, not reservation');
  assert.equal(await begin(db, await enrollment(db)), false);
  assert.equal(await finish(db, members.at(-1)), true);
  assert.deepEqual(await batch(db), settled, 'idempotent completion cannot restart the clock');
  await ageBatch(db, sender, 901, true);
  assert.equal(await begin(db, await enrollment(db)), true);
  assert.equal((await batch(db)).used, 1);
});

test('060 partial batches reset at fifteen minutes after settlement, never reservation or while sending', async (t) => {
  const db = await setup(t);
  const first = await enrollment(db);
  assert.equal(await begin(db, first), true);
  await ageBatch(db, sender, 86400);
  const second = await enrollment(db, true);
  assert.equal(await begin(db, second), true);
  assert.equal((await batch(db)).used, 2, 'live dispatch prevents reset even with old sender clocks');
  assert.equal(await finish(db, first), true);
  assert.equal(await finish(db, second), true);
  for (const [age, expected] of [[899, 3], [901, 1]]) {
    await ageBatch(db, sender, age);
    const e = await enrollment(db);
    assert.equal(await begin(db, e), true);
    assert.equal((await batch(db)).used, expected, `partial settlement boundary ${age}s`);
    assert.equal(await finish(db, e), true);
  }
});
