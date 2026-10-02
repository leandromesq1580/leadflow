#!/usr/bin/env python3
"""Synthetic PostgreSQL 16 multi-session contract tests; never loads .env.

L4P_TEST_PG_ROOT=/path/to/extracted/pg venv/bin/python tests/sequence-batch-pg-concurrency.py
Creates a fresh Unix-socket-only cluster under TMPDIR; snapshots real 006/052/053/054.
Failures remain failures: no function replacement, no xfail and no production writes.
Time-boundary tests move synthetic timestamps instead of sleeping five minutes.
"""
import concurrent.futures as cf
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import traceback
import uuid

import psycopg
from psycopg.rows import dict_row

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ['TMPDIR']) / 'sequence-batch-pg'
ROOT.mkdir(parents=True, exist_ok=True)
RUN = ROOT / str(time.time_ns())
RUN.mkdir(mode=0o700)
# PostgreSQL Unix socket paths must remain below the platform path limit.
SOCK = Path(os.environ['TMPDIR']) / ('sbpg-' + str(os.getpid()))
SOCK.mkdir(mode=0o700)
PG = Path(os.environ['L4P_TEST_PG_ROOT'])
BIN = PG / 'usr/lib/postgresql/16/bin'
ENV = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8', 'TMPDIR': str(ROOT)}
LOG = (RUN / 'events.jsonl').open('w')
POOL = cf.ThreadPoolExecutor(max_workers=24)
CONNS = []
RESULTS = []
HASHES = {}
B = '00000000-0000-4000-8000-000000000001'
O = '00000000-0000-4000-8000-000000000002'
SENDER = '15555550100'
OTHER = '15555550200'
BEGIN = "select begin_sequence_batch(%s,%s,%s,'synthetic') r"
FINISH = "select finish_sequence_batch(%s,%s,%s,'0:0',clock_timestamp()+interval '1 day',%s,'15555550999') ok"
INBOUND = "insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,sent_at) values(%s,%s,'in','15555550999',%s,%s,clock_timestamp())"


def log(event, **data):
    line = json.dumps({'event': event, **data}, default=str)
    print(line, flush=True)
    LOG.write(line + '\n')
    LOG.flush()


def command(*args, check=True):
    p = subprocess.run(list(map(str, args)), env=ENV, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, timeout=35)
    log('command', argv=list(map(str, args)), rc=p.returncode, output=p.stdout)
    if check:
        p.check_returncode()
    return p


def connect(db):
    c = psycopg.connect(host=str(SOCK), port=55441, user=getpass.getuser(), dbname=db,
                       autocommit=True, row_factory=dict_row, connect_timeout=3,
                       options='-c statement_timeout=6000 -c lock_timeout=4000 -c deadlock_timeout=300 -c idle_in_transaction_session_timeout=10000')
    CONNS.append(c)
    return c


def q(c, sql, args=None):
    cur = c.execute(sql, args)
    return cur.fetchall() if cur.description else []


def setup():
    db = 'case_' + uuid.uuid4().hex
    q(admin, f'CREATE DATABASE {db} TEMPLATE fixture_base')
    c = connect(db)
    q(c, 'insert into buyers(id) values(%s),(%s)', [B, O])
    return c, db


def enrollment(c, mode='legacy', owner=B, claim=True):
    lead, seq = str(uuid.uuid4()), str(uuid.uuid4())
    q(c, 'insert into leads(id,assigned_to) values(%s,%s)', [lead, owner])
    q(c, "insert into sequences(id,buyer_id,name,enabled,mode,ai_config) values(%s,%s,'synthetic',true,%s,%s)",
      [seq, owner, mode, json.dumps({'timezone': 'UTC', 'days': list(range(7)), 'start': '00:00', 'end': '23:59'})])
    if mode == 'legacy':
        q(c, "insert into sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body) values(%s,0,0,'send_template','synthetic'),(%s,1,1,'send_template','synthetic')", [seq, seq])
    e = q(c, "select * from enroll_sequence(%s,%s,%s,clock_timestamp()-interval '1 minute')", [owner, seq, lead])[0]
    if claim:
        e = q(c, 'select * from ' + ('claim_ai_sequence' if mode == 'ai_until_reply' else 'claim_legacy_sequence') + '(%s)', [e['id']])[0]
    return e


def begin(c, e, sender=SENDER):
    return q(c, BEGIN, [e['id'], e['lease_token'], sender])[0]['r']['allowed']


def finish(c, e, sender=SENDER, ack=True):
    return q(c, FINISH, [e['id'], e['lease_token'], 'ack-' + str(e['id']) if ack else None, sender])[0]['ok']


def state(c, e):
    return q(c, 'select status,stop_reason,delivery_status,current_step,attempts,lease_token,next_run_at,generation_status from sequence_enrollments where id=%s', [e['id']])[0]


def batch(c):
    return q(c, 'select * from sequence_sender_batches order by sender')


def parallel(db, jobs):
    barrier = threading.Barrier(len(jobs))
    cs = [connect(db) for _ in jobs]
    def run(c, job):
        barrier.wait(timeout=4)
        return job(c)
    fs = [POOL.submit(run, c, job) for c, job in zip(cs, jobs)]
    out = [f.result(10) for f in fs]
    log('parallel', pids=[c.info.backend_pid for c in cs], results=out)
    return out


def observe(c, waiter, future):
    end = time.monotonic() + 2
    while time.monotonic() < end:
        blockers = q(c, 'select pg_blocking_pids(%s) p', [waiter.info.backend_pid])[0]['p']
        if blockers:
            log('blocked', waiter=waiter.info.backend_pid, blockers=blockers)
            return blockers
        if future.done():
            return []
        time.sleep(.01)
    raise AssertionError('No lock wait observed')


def race_budget():
    c, db = setup()
    es = [enrollment(c, 'ai_until_reply' if i % 2 else 'legacy', O if i % 3 else B) for i in range(16)]
    out = parallel(db, [lambda x, e=e: begin(x, e) for e in es])
    log('budget', batches=batch(c), states=[state(c, e) for e in es])
    assert sum(out) == 10, out
    assert batch(c)[0]['used'] == 10
    assert q(c, 'select count(*) n from sequence_batch_dispatches')[0]['n'] == 10
    for e, allowed in zip(es, out):
        s = state(c, e)
        assert s['current_step'] == 0
        if not allowed:
            assert s['attempts'] == 0 and s['lease_token'] is None and s['status'] == 'active'
            assert s['delivery_status'] == 'idle'
    b = batch(c)[0]
    assert (b['cooldown_until'] - b['last_reserved_at']).total_seconds() >= 300


def independent():
    c, db = setup()
    es = [enrollment(c) for _ in range(22)]
    out = parallel(db, [lambda x, e=e, i=i: begin(x, e, SENDER if i < 11 else OTHER) for i, e in enumerate(es)])
    assert sum(out[:11]) == sum(out[11:]) == 10
    assert [b['used'] for b in batch(c)] == [10, 10]
    log('independent', batches=batch(c))


def duplicate(mode):
    c, db = setup()
    e = enrollment(c, mode, claim=False)
    fn = 'claim_ai_sequence' if mode == 'ai_until_reply' else 'claim_legacy_sequence'
    claims = parallel(db, [lambda x: q(x, f'select * from {fn}(%s)', [e['id']])] * 2)
    assert sum(map(len, claims)) == 1
    e = next(r[0] for r in claims if r)
    assert sum(parallel(db, [lambda x: begin(x, e)] * 2)) == 1
    assert all(parallel(db, [lambda x: finish(x, e)] * 2))
    s = state(c, e)
    log('idempotency', state=s, batches=batch(c))
    assert s['current_step'] == 1 and s['attempts'] == 0
    assert q(c, "select count(*) n from whatsapp_messages where direction='out'")[0]['n'] == 1
    assert batch(c)[0]['used'] == 1


def cooldown():
    c, db = setup()
    es = [enrollment(c) for _ in range(10)]
    assert all(parallel(db, [lambda x, e=e: begin(x, e) for e in es]))
    before = batch(c)[0]['cooldown_until']
    assert finish(c, es[0])
    after = batch(c)[0]['cooldown_until']
    assert after > before
    # An elapsed deadline must not reset while any admitted member remains in flight.
    q(c, "update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second'")
    waiting = enrollment(c)
    assert not begin(c, waiting)
    assert state(c, waiting)['attempts'] == 0
    assert all(parallel(db, [lambda x, e=e: finish(x, e) for e in es[1:]]))
    b = batch(c)[0]
    remaining = q(c, 'select extract(epoch from cooldown_until-clock_timestamp()) n from sequence_sender_batches')[0]['n']
    assert remaining > 295
    assert not begin(c, enrollment(c))
    q(c, "update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second'")
    assert begin(c, enrollment(c))
    assert batch(c)[0]['used'] == 1
    log('cooldown', admission_deadline=before, first_confirmation_deadline=after, last_confirmation=b, remaining_seconds=remaining)


def partial_slow_completion():
    c, db = setup()
    # 9 messages reserved at t0, delivered at t0+90s. At t0+301s the
    # admissions are old but all nine deliveries are still in the last 5min.
    es = [enrollment(c, 'ai_until_reply' if i % 2 else 'legacy', O if i % 3 else B) for i in range(9)]
    assert all(parallel(db, [lambda x, e=e: begin(x, e) for e in es]))
    assert all(parallel(db, [lambda x, e=e: finish(x, e) for e in es]))
    q(c, "update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '301 seconds'")
    q(c, "update sequence_batch_dispatches set started_at=clock_timestamp()-interval '301 seconds', expires_at=clock_timestamp()-interval '181 seconds'")
    q(c, "update whatsapp_messages set sent_at=clock_timestamp()-interval '211 seconds' where direction='out'")
    # The new completion clock, when installed, uses the same simulated time.
    if q(c, "select 1 from information_schema.columns where table_name='sequence_sender_batches' and column_name='last_settled_at'"):
        q(c, "update sequence_sender_batches set last_settled_at=clock_timestamp()-interval '211 seconds'")
    fresh = [enrollment(c, 'ai_until_reply' if i % 2 else 'legacy', O if i % 3 else B) for i in range(12)]
    out = parallel(db, [lambda x, e=e: begin(x, e) for e in fresh])
    for e, allowed in zip(fresh, out):
        if allowed: assert finish(c, e)
    count = q(c, "select count(*) n from whatsapp_messages where direction='out' and sent_at>clock_timestamp()-interval '5 minutes'")[0]['n']
    log('partial_slow_completion', recent_confirmed_deliveries=count, new_admissions=sum(out), batches=batch(c))
    assert count <= 10, f'{count} confirmed fixture deliveries in a rolling 5min window'
    assert sum(out) == 1


def partial_completion_boundaries():
    for age, expected_used in ((299, 2), (301, 1)):
        c, db = setup()
        e = enrollment(c)
        assert begin(c, e) and finish(c, e)
        settled = batch(c)[0]['last_settled_at']
        assert finish(c, e)  # Idempotent finish must not change completion clock.
        assert batch(c)[0]['last_settled_at'] == settled
        q(c, "update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '400 seconds', last_settled_at=clock_timestamp()-(%s * interval '1 second')", [age])
        assert begin(c, enrollment(c))
        assert batch(c)[0]['used'] == expected_used
        log('partial_boundary', age=age, used=batch(c)[0]['used'])


def partial_finish_begin_serialization():
    c, db = setup()
    es = [enrollment(c) for _ in range(9)]
    assert all(begin(c, e) for e in es)
    assert all(finish(c, e) for e in es[:-1])
    q(c, "update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '400 seconds', last_settled_at=clock_timestamp()-interval '400 seconds'")
    a, b = connect(db), connect(db)
    q(a, 'begin')
    assert finish(a, es[-1])  # Holds ledger + sender until commit.
    fresh = enrollment(c, 'ai_until_reply', O)
    f = POOL.submit(begin, b, fresh)
    assert observe(c, b, f)
    q(a, 'commit')
    assert f.result(8)
    assert batch(c)[0]['used'] == 10, 'must re-read the committed completion after sender lock'
    assert not begin(c, enrollment(c))


def partial_unknown_completion(kind):
    c, db = setup()
    e = enrollment(c)
    assert begin(c, e)
    q(c, "update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '400 seconds',last_settled_at=clock_timestamp()-interval '400 seconds'")
    before = q(c, 'select clock_timestamp() t')[0]['t']
    if kind == 'lost_response':
        q(c, "select defer_sequence_batch(%s,%s,'lost',clock_timestamp(),false)", [e['id'], e['lease_token']])
    elif kind == 'claim_recovery':
        q(c, "update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=%s", [e['id']])
        assert not q(c, 'select * from claim_legacy_sequence(%s)', [e['id']])
    else:
        if kind == 'deleted': q(c, 'delete from sequence_enrollments where id=%s', [e['id']])
        if kind == 'stopped': mutation(c, e, 'stop')
        q(c, "update sequence_batch_dispatches set expires_at=clock_timestamp()-interval '1 second' where token=%s", [e['lease_token']])
        cleanup = parallel(db, [lambda x: q(x, 'select expire_sequence_batch_dispatches(%s) n',[SENDER])[0]['n']]*2)
        assert sum(cleanup) == 1
    b = batch(c)[0]
    assert b['last_settled_at'] >= before
    assert q(c, 'select state from sequence_batch_dispatches where token=%s',[e['lease_token']])[0]['state'] == 'unknown'
    assert not begin(c, e) and not finish(c, e)
    if kind != 'deleted':
        assert state(c, e)['status'] in ('paused','stopped')
    else:
        assert not q(c, 'select id from sequence_enrollments where id=%s',[e['id']])
    # Unknown permission never returns capacity, even after all clocks expire.
    q(c, "update sequence_sender_batches set cooldown_until=null,last_reserved_at=clock_timestamp()-interval '1 day',last_settled_at=clock_timestamp()-interval '1 day'")
    assert not begin(c, enrollment(c, 'ai_until_reply', O))
    assert batch(c)[0]['used'] == 1
    fresh = enrollment(c, 'ai_until_reply', O)
    assert not q(c, 'select preflight_sequence_batch(%s,%s,%s) ok', [fresh['id'],fresh['lease_token'],SENDER])[0]['ok']
    assert begin(c, enrollment(c), OTHER), 'independent sender must remain usable'
    log('partial_unknown_completion', kind=kind, batches=batch(c))


def completion_acl():
    c, db = setup()
    for role in ('anon','authenticated','service_role'):
        for fn in ('settle_sequence_batch_dispatch()', 'begin_sequence_batch(uuid,uuid,text,text)'):
            assert q(c, "select has_function_privilege(%s,%s,'execute') ok",[role, 'public.'+fn])[0]['ok'] == (role=='service_role')
    assert all(r['relrowsecurity'] for r in q(c, "select relrowsecurity from pg_class where relname in ('sequence_sender_batches','sequence_batch_dispatches')"))


def mutation(c, e, kind):
    if kind == 'stop':
        return q(c, 'select stop_sequence_enrollment(%s,%s)', [e['buyer_id'], e['id']])
    if kind == 'ownership':
        return q(c, 'update leads set assigned_to=%s where id=%s', [O, e['lead_id']])
    return q(c, INBOUND, [e['buyer_id'], e['lead_id'], SENDER, 'STOP' if kind == 'optout' else 'reply'])


def cancellation(mode, kind, stage):
    c, db = setup()
    e = enrollment(c, mode)
    if stage == 'finish':
        assert begin(c, e)
    a, b = connect(db), connect(db)
    q(a, 'begin')
    mutation(a, e, kind)
    future = POOL.submit(finish if stage == 'finish' else begin, b, e)
    observe(c, b, future)
    q(a, 'commit')
    result = future.result(8)
    s = state(c, e)
    log('cancellation', mode=mode, kind=kind, stage=stage, result=result, state=s, batches=batch(c))
    if stage == 'begin':
        assert not result, 'permission granted while cancellation transaction was in flight; no serialization'
        assert s['current_step'] == 0
    else:
        assert result and s['current_step'] == 1
    assert s['status'] != 'active', 'cancellation lost or ownership/inbound ignored'


def fail_closed(mode, kind):
    c, db = setup()
    e = enrollment(c, mode)
    if kind == 'expired_idle':
        q(c, "update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=%s", [e['id']])
        assert not begin(c, e)
        assert state(c, e)['current_step'] == 0
        return
    assert begin(c, e)
    before = state(c, e)
    if kind == 'missing_ack':
        try:
            finish(c, e, ack=False)
            raise AssertionError('missing ack accepted')
        except psycopg.Error as ex:
            log('expected_error', sqlstate=ex.sqlstate, error=str(ex))
            assert 'missing_delivery_confirmation' in str(ex)
        assert state(c, e) == before
        assert q(c, 'select state from sequence_batch_dispatches')[0]['state'] == 'sending'
        assert finish(c, e)
    else:
        if kind == 'unknown':
            q(c, "select defer_sequence_batch(%s,%s,'delivery_unknown',now(),true)", [e['id'], e['lease_token']])
        else:
            q(c, "update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=%s", [e['id']])
            fn = 'claim_ai_sequence' if mode == 'ai_until_reply' else 'claim_legacy_sequence'
            assert not q(c, f'select * from {fn}(%s)', [e['id']])
        assert not begin(c, e) and not finish(c, e)
        s = state(c, e)
        assert s['current_step'] == 0 and s['delivery_status'] == 'unknown' and s['status'] == 'paused'
        assert q(c, 'select state from sequence_batch_dispatches')[0]['state'] == 'unknown'
        assert batch(c)[0]['used'] == 1
    log('fail_closed', kind=kind, state=state(c, e), batches=batch(c))


def preflight_wait():
    c, db = setup()
    e = enrollment(c, 'ai_until_reply')
    q(c, "insert into sequence_sender_batches(sender,used,cooldown_until) values(%s,10,clock_timestamp()+interval '5 minutes')", [SENDER])
    q(c, 'update sequence_enrollments set attempts=3 where id=%s', [e['id']])
    assert not q(c, 'select preflight_sequence_batch(%s,%s,%s) ok', [e['id'], e['lease_token'], SENDER])[0]['ok']
    s = state(c, e)
    log('preflight_wait', state=s)
    assert s['attempts'] == 2 and s['current_step'] == 0 and s['generation_status'] == 'idle' and s['status'] == 'active'
    assert not q(c, 'select * from sequence_batch_dispatches')


def inversion(mode, kind):
    c, db = setup()
    e = enrollment(c, mode)
    assert begin(c, e)
    a, b = connect(db), connect(db)
    q(a, 'begin')
    q(a, 'select id from sequence_enrollments where id=%s for update', [e['id']])
    f = POOL.submit(mutation, b, e, kind)
    blockers = observe(c, b, f)
    # Legacy inbound triggers need not lock the enrollment; log that distinct behavior.
    errors = []
    try:
        assert finish(a, e)
        q(a, 'commit')
    except psycopg.Error as ex:
        errors.append({'side': 'finish', 'sqlstate': ex.sqlstate, 'error': str(ex)})
        q(a, 'rollback')
    try:
        f.result(8)
    except psycopg.Error as ex:
        errors.append({'side': kind, 'sqlstate': ex.sqlstate, 'error': str(ex)})
    log('inversion', errors=errors, blockers=blockers, state=state(c, e))
    assert not errors, errors
    assert state(c, e)['current_step'] == 1


def old_rpc_fallback():
    c, db = setup()
    # Explicit rollout limitation: old runtimes are unpaced until drained.
    # Verify compatibility AND prohibit new application code from using that RPC.
    es = [enrollment(c) for _ in range(10)]
    assert all(begin(c, e) for e in es)
    e = enrollment(c, 'ai_until_reply')
    r = q(c, "select id from begin_ai_send(%s,%s,'synthetic')", [e['id'], e['lease_token']])
    log('old_rpc_fallback', granted=r, batches=batch(c), state=state(c, e))
    assert r, 'additive migration must preserve old runtime until rollout completes'
    for path in ('src/lib/ai-sequence-engine.ts', 'src/lib/sequence-engine.ts', 'src/app/api/admin/force-sequence-step/route.ts'):
        text = (REPO / path).read_text()
        assert 'begin_ai_send' not in text, f'new application fallback bypasses quota: {path}'
    log('rollout_limitation', old_runtime_unpaced=True, drain_required=True, new_app_old_rpc_reference=False)


def stopped_orphan_cleanup(mode):
    c, db = setup()
    es = [enrollment(c, mode) for _ in range(10)]
    assert all(parallel(db, [lambda x, e=e: begin(x, e) for e in es]))
    assert all(parallel(db, [lambda x, e=e: finish(x, e) for e in es[:9]]))
    orphan = es[-1]
    mutation(c, orphan, 'stop')
    q(c, "update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=%s", [orphan['id']])
    q(c, "update sequence_batch_dispatches set expires_at=clock_timestamp()-interval '1 second' where token=%s", [orphan['lease_token']])
    q(c, "update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second'")
    newcomers = [enrollment(c) for _ in range(12)]
    out = parallel(db, [lambda x, e=e: begin(x, e) for e in newcomers])
    s = state(c, orphan)
    dispatch = q(c, 'select state from sequence_batch_dispatches where token=%s', [orphan['lease_token']])[0]['state']
    log('orphan_cleanup', results=out, orphan=s, dispatch=dispatch, batches=batch(c))
    assert not any(out), 'expired orphan must start fresh quarantine, not permit immediate sends'
    assert dispatch == 'unknown', 'stopped expired sending dispatch permanently stalls sender; not quarantined'
    assert s['status'] == 'stopped' and s['current_step'] == 0
    remaining = q(c, 'select extract(epoch from cooldown_until-clock_timestamp()) n from sequence_sender_batches')[0]['n']
    assert remaining > 295, 'cleanup must extend quarantine by five minutes'
    assert not finish(c, orphan) and not begin(c, orphan)
    q(c, "update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second'")
    fresh = [enrollment(c) for _ in range(12)]
    out = parallel(db, [lambda x, e=e: begin(x, e) for e in fresh])
    assert sum(out) == 0, 'unknown permission must retain capacity indefinitely'
    assert state(c, orphan)['status'] == 'stopped' and state(c, orphan)['current_step'] == 0


def lost_begin_response(mode):
    c, db = setup()
    e = enrollment(c, mode)
    assert begin(c, e)
    # Simulate committed admission whose response never reached the application.
    q(c, "select defer_sequence_batch(%s,%s,'transport_response_lost',clock_timestamp(),false)", [e['id'], e['lease_token']])
    s = state(c, e)
    ledger = q(c, 'select state from sequence_batch_dispatches where token=%s', [e['lease_token']])[0]['state']
    log('lost_begin_response', mode=mode, enrollment=s, ledger=ledger)
    assert s['status'] != 'active' and s['delivery_status'] == 'unknown'
    assert ledger == 'unknown' and s['current_step'] == 0
    assert not begin(c, e) and not finish(c, e)
    fn = 'claim_ai_sequence' if mode == 'ai_until_reply' else 'claim_legacy_sequence'
    assert not q(c, f'select * from {fn}(%s)', [e['id']])


def sender_unavailable():
    c, db = setup()
    e = enrollment(c, 'ai_until_reply')
    assert not begin(c, e, None)
    s = state(c, e)
    assert s['attempts'] == 0 and s['current_step'] == 0 and s['status'] == 'active'
    assert not q(c, 'select * from sequence_batch_dispatches')
    log('sender_unavailable', state=s)


def case(name, fn):
    start = len(CONNS)
    log('case_start', name=name)
    try:
        fn()
        RESULTS.append({'case': name, 'ok': True})
        log('PASS', name=name)
    except Exception as ex:
        RESULTS.append({'case': name, 'ok': False, 'error': str(ex), 'type': type(ex).__name__})
        log('FAIL', name=name, error=str(ex), trace=traceback.format_exc())
    finally:
        for c in CONNS[start:]:
            c.close()



def independent_suppression_order():
    c, db = setup()
    e1 = enrollment(c)
    e2 = enrollment(c)
    q(c, 'update sequence_enrollments set lead_id=%s where id=%s', [e1['lead_id'],e2['id']])
    e2['lead_id']=e1['lead_id']
    assert begin(c,e1) and begin(c,e2)
    q(c, 'update sequence_sender_batches set used=10')
    q(c, "update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=%s",[e1['id']])
    a,b=connect(db),connect(db)
    q(a,'begin')
    q(a,'select id from sequence_enrollments where id=%s for update',[e1['id']])
    q(a,"insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values(%s,%s,'delivery_unknown') on conflict do nothing",[B,e1['lead_id']])
    future=POOL.submit(q,b,"select defer_sequence_batch(%s,%s,'delivery_unknown',clock_timestamp(),true)",[e2['id'],e2['lease_token']])
    observe(c,b,future)
    errors=[]
    try:
        q(a,'select * from claim_legacy_sequence(%s)',[e1['id']])
        q(a,'commit')
    except psycopg.Error as ex:
        errors.append({'side':'claim','sqlstate':ex.sqlstate,'error':str(ex)})
        q(a,'rollback')
    try: future.result(8)
    except psycopg.Error as ex: errors.append({'side':'defer','sqlstate':ex.sqlstate,'error':str(ex)})
    log('suppression_lock_order',errors=errors)
    assert not errors, errors

def independent_upserts():
    for mode in ('legacy','ai_until_reply'):
        for kind in ('inbound','optout','lead_optout'):
            c,db=setup();e=enrollment(c,mode)
            q(c,"insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values(%s,%s,'delivery_unknown')",[B,e['lead_id']])
            q(c,'update ai_sequence_suppressions set resolved_at=clock_timestamp() where lead_id=%s',[e['lead_id']])
            if kind=='lead_optout': q(c,'update leads set sms_opted_out=true where id=%s',[e['lead_id']])
            else: mutation(c,e,kind)
            r=q(c,'select reason,resolved_at from ai_sequence_suppressions where lead_id=%s',[e['lead_id']])[0]
            assert r['resolved_at'] is None
            assert r['reason']==('replied' if kind=='inbound' else 'optout')
            assert state(c,e)['status']=='stopped'

started = False
try:
    fixture_source = (REPO / 'tests/sequence-batch-sql.test.cjs').read_text()
    fixture = re.search(r'await db.exec\(`(.*?)`\)', fixture_source, re.S).group(1)
    base = (REPO / 'supabase/migrations/006_inbox_sequences_ai_push.sql').read_text().split('-- AI LEAD SCORING')[0]
    sources = [('fixture.sql', fixture), ('006-prefix.sql', base)]
    for name in ('052_ai_sequences_until_reply.sql', '053_ai_suppression_resolution.sql', '054_sequence_batch_pacing.sql'):
        sources.append((name, (REPO / 'supabase/migrations' / name).read_text()))
    completion = REPO / 'supabase/migrations/055_sequence_batch_completion_clock.sql'
    if completion.exists():
        sources.append((completion.name, completion.read_text()))
    reply = REPO / 'supabase/migrations/056_sequence_reply_stage.sql'
    if reply.exists():
        sources.append((reply.name, reply.read_text()))
    for name, sql in sources:
        (RUN / name).write_text(sql)
        HASHES[name] = hashlib.sha256(sql.encode()).hexdigest()
    log('snapshots', run=str(RUN), sha256=HASHES)
    command(BIN / 'initdb', '-D', RUN / 'data', '-L', PG / 'usr/share/postgresql/16', '--no-locale', '--encoding=UTF8', '--auth=trust', '--username=' + getpass.getuser())
    command(BIN / 'pg_ctl', '-D', RUN / 'data', '-l', RUN / 'postgres.log', '-o', f"-c listen_addresses='' -c unix_socket_directories='{SOCK}' -c port=55441 -c shared_preload_libraries=''", '-w', 'start')
    started = True
    admin = connect('postgres')
    v = q(admin, "select version(),current_setting('listen_addresses') listen,current_setting('server_version_num') ver")[0]
    assert v['listen'] == '' and v['ver'].startswith('16')
    log('server', **v)
    q(admin, 'CREATE DATABASE fixture_base')
    template = connect('fixture_base')
    for name, sql in sources:
        q(template, sql)
        log('applied', name=name, sha256=HASHES[name])
    template.close()
    case('independent_053_upserts', independent_upserts)
    case('independent_shared_suppression_lock_order', independent_suppression_order)
    case('16_concurrent_begins_shared_AI_legacy_buyers_max10', race_budget)
    case('22_concurrent_begins_two_independent_numbers', independent)
    case('cooldown_tenth_admission_inflight_confirmation_and_reset', cooldown)
    case('partial_slow_completion_rolling_5min_shared_modes_buyers', partial_slow_completion)
    case('partial_completion_boundaries_and_idempotence', partial_completion_boundaries)
    case('partial_finish_begin_serialization', partial_finish_begin_serialization)
    case('completion_acl_rls_preserved', completion_acl)
    for kind in ('lost_response','claim_recovery','deleted','stopped'):
        case('partial_unknown_'+kind, lambda k=kind: partial_unknown_completion(k))
    case('preflight_wait_preserves_step_and_attempt', preflight_wait)
    case('sender_unavailable_no_fallback_no_attempt', sender_unavailable)
    for mode in ('legacy', 'ai_until_reply'):
        case(mode + '_lost_begin_response_quarantined', lambda m=mode: lost_begin_response(m))
        case(mode + '_stopped_orphan_concurrent_cleanup', lambda m=mode: stopped_orphan_cleanup(m))
        case(mode + '_two_claims_double_begin_double_finish', lambda m=mode: duplicate(m))
        for kind in ('stop', 'inbound', 'optout', 'ownership'):
            for stage in ('begin', 'finish'):
                case(f'{mode}_{kind}_{stage}', lambda m=mode, k=kind, s=stage: cancellation(m, k, s))
        for kind in ('expired_idle', 'expired_sending', 'unknown', 'missing_ack'):
            case(f'{mode}_{kind}', lambda m=mode, k=kind: fail_closed(m, k))
        for kind in ('inbound', 'optout', 'ownership'):
            case(f'{mode}_finish_{kind}_lock_inversion', lambda m=mode, k=kind: inversion(m, k))
    case('rollout_old_rpc_compatible_but_new_app_has_no_fallback', old_rpc_fallback)
finally:
    for c in CONNS:
        try:
            c.close()
        except Exception:
            pass
    POOL.shutdown(wait=True, cancel_futures=True)
    # Check status even if startup threw after the server was spawned.
    status = command(BIN / 'pg_ctl', '-D', RUN / 'data', 'status', check=False)
    if started or status.returncode == 0:
        command(BIN / 'pg_ctl', '-D', RUN / 'data', '-m', 'fast', '-w', 'stop')
    stopped = command(BIN / 'pg_ctl', '-D', RUN / 'data', 'status', check=False).returncode == 3
    summary = {'passed': sum(r['ok'] for r in RESULTS), 'failed': sum(not r['ok'] for r in RESULTS),
               'results': RESULTS, 'cluster_stopped': stopped, 'run': str(RUN), 'sha256': HASHES}
    (RUN / 'summary.json').write_text(json.dumps(summary, indent=2))
    log('summary', **summary)
    LOG.close()
    assert stopped
raise SystemExit(1 if any(not r['ok'] for r in RESULTS) else 0)
