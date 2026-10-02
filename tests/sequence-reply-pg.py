#!/usr/bin/env python3
"""Local PG16, Unix socket only, fresh synthetic cluster; never reads .env.
L4P_TEST_PG_ROOT=/path/to/pg TMPDIR=/short/private/scratch python tests/sequence-reply-pg.py
"""
import concurrent.futures as cf
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import uuid
import psycopg
from psycopg.rows import dict_row

REPO = Path(__file__).resolve().parents[1]
RUN = Path(os.environ.get('REPLY_ARTIFACT_DIR', os.environ['TMPDIR'])) / ('reply-pg-' + uuid.uuid4().hex[:8])
RUN.mkdir(mode=0o700)
SOCK = Path(os.environ['TMPDIR']) / ('rp-' + str(os.getpid()))
SOCK.mkdir(mode=0o700)
PG = Path(os.environ['L4P_TEST_PG_ROOT'])
BIN = PG / 'usr/lib/postgresql/16/bin'
B = '00000000-0000-4000-8000-000000000001'
CONNS = []
RESULTS = []
ENV = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8'}

def cmd(*args, check=True):
    p = subprocess.run(list(map(str, args)), env=ENV, capture_output=True, text=True, timeout=40)
    print(p.stdout + p.stderr, flush=True)
    if check:
        p.check_returncode()
    return p

def connect():
    c = psycopg.connect(host=str(SOCK), port=55442, user=getpass.getuser(), dbname='postgres', autocommit=True, row_factory=dict_row,
                        options='-c statement_timeout=6000 -c lock_timeout=3000 -c deadlock_timeout=200')
    CONNS.append(c)
    return c

def q(c, sql, args=None):
    cur = c.execute(sql, args)
    return cur.fetchall() if cur.description else []

def setup(c, mode='legacy'):
    pipe = q(c, "insert into pipelines(buyer_id,name) values(%s,'fixture') returning id", [B])[0]['id']
    stages = q(c, "insert into pipeline_stages(pipeline_id,name) values(%s,'Follow-up'),(%s,'Replied'),(%s,'Manual') returning id", [pipe]*3)
    lead = q(c, 'insert into leads(assigned_to) values(%s) returning id', [B])[0]['id']
    card = q(c, "insert into pipeline_leads(lead_id,pipeline_id,stage_id,moved_at) values(%s,%s,%s,'2000-01-01') returning id", [lead,pipe,stages[0]['id']])[0]['id']
    config = {'name':'fixture','mode':mode,'ai_config':{'stop_on_stage_exit':False},'trigger_stage_id':stages[0]['id'],'reply_stage_id':stages[1]['id']}
    seq = q(c, "select * from save_sequence(%s,null,%s,'[]')", [B,json.dumps(config, default=str)])[0]['id']
    q(c, 'update sequences set enabled=true where id=%s', [seq])
    e = q(c, 'select * from enroll_sequence(%s,%s,%s,now())', [B,seq,lead])[0]['id']
    return {'lead':lead,'card':card,'stages':stages,'e':e,'seq':seq}

def inbound(c, x, body='Interested'):
    if x.get('channel') == 'sms':
        q(c, "insert into sms_messages(lead_id,direction,body) values(%s,'in',%s)", [x['lead'],body])
        return
    q(c, "insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values(%s,%s,'in','15555550999','15555550100',%s)", [B,x['lead'],body])

def state(c, x):
    return q(c, 'select stage_id,sequence_reply_moved_at from pipeline_leads where id=%s', [x['card']])[0]

def stopped(c, x):
    assert q(c, 'select status from sequence_enrollments where id=%s', [x['e']])[0]['status']=='stopped'
    assert q(c, 'select reason from ai_sequence_suppressions where lead_id=%s', [x['lead']])[0]['reason'] in ('replied','optout')

started=False
try:
    cmd(BIN/'initdb','-D',RUN/'data','-L',PG/'usr/share/postgresql/16','--no-locale','--encoding=UTF8','--auth=trust')
    cmd(BIN/'pg_ctl','-D',RUN/'data','-l',RUN/'postgres.log','-o',f"-c listen_addresses='' -c unix_socket_directories='{SOCK}' -c port=55442",'-w','start')
    started=True
    c=connect()
    print(q(c,"select version(),current_setting('listen_addresses') listen"),flush=True)
    fixture = re.search(r'await db.exec\(`(.*?)`\)', (REPO/'tests/sequence-reply-stage-sql.test.cjs').read_text(), re.S).group(1)
    sources = [fixture, (REPO/'supabase/migrations/004_kanban_crm.sql').read_text().split('-- 4. Follow-ups')[0],
               (REPO/'supabase/migrations/006_inbox_sequences_ai_push.sql').read_text().split('-- AI LEAD SCORING')[0]]
    for name in ['052_ai_sequences_until_reply.sql','053_ai_suppression_resolution.sql','054_sequence_batch_pacing.sql','055_sequence_batch_completion_clock.sql','056_sequence_reply_stage.sql']:
        sources.append((REPO/'supabase/migrations'/name).read_text())
    for sql in sources:
        q(c,sql)
    q(c,'insert into buyers(id) values(%s)',[B])
    q(c,"create table movements(card uuid); create function record_move() returns trigger language plpgsql as $$ begin insert into movements values(new.id); return new; end $$; create trigger record_move after update of stage_id on pipeline_leads for each row execute function record_move();")
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        for mode in ['legacy','ai_until_reply']:
            x=setup(c,mode)
            futures=[pool.submit(inbound,connect(),x) for _ in range(8)]
            for f in futures:f.result(10)
            stopped(c,x)
            assert state(c,x)['stage_id']==x['stages'][1]['id']
            assert q(c,'select count(*) n from movements where card=%s',[x['card']])[0]['n']==1
            RESULTS.append(mode+'_eight_inbounds_one_move')
            # Card/target contention must abstain without waiting for the opposing recheck lock.
            for lock,channel in [(lock,channel) for lock in ['card','stage','sequence'] for channel in ['wa','sms']]:
                x=setup(c,mode); x['channel']=channel; a=connect(); b=connect()
                q(a,'begin')
                table,key={'card':('pipeline_leads',x['card']),'stage':('pipeline_stages',x['stages'][1]['id']),'sequence':('sequences',x['seq'])}[lock]
                q(a,f'select id from {table} where id=%s for update',[key])
                f=pool.submit(inbound,b,x)
                f.result(8) # Must finish BEFORE a commits, not deadlock or time out.
                if lock=='stage': q(a,"update pipeline_stages set name='Renamed destination' where id=%s",[key])
                q(a,'commit');stopped(c,x)
                assert state(c,x)['stage_id']==x['stages'][0]['id']
                assert state(c,x)['sequence_reply_moved_at'] is None
                RESULTS.append(mode+'_'+channel+'_'+lock+'_contention_stop_survives')
                q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
                q(c,'select drain_sequence_reply_moves(25)')
                assert state(c,x)['stage_id']==x['stages'][1]['id'], 'durable intent must retry without another inbound'
                assert q(c,'select count(*) n from movements where card=%s',[x['card']])[0]['n']==1
                stopped(c,x)
                RESULTS.append(mode+'_'+channel+'_'+lock+'_drain_moves_without_inbound')
            # Manual movement wins when it owns the card, even if the inbound holds enrollment locks next.
            x=setup(c,mode);a=connect();b=connect()
            q(a,'begin');q(a,'select id from pipeline_leads where id=%s for update',[x['card']])
            pool.submit(inbound,b,x).result(8)
            q(a,'update pipeline_leads set stage_id=%s,moved_at=clock_timestamp() where id=%s',[x['stages'][2]['id'],x['card']]);q(a,'commit')
            stopped(c,x)
            assert state(c,x)['stage_id']==x['stages'][2]['id']
            q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
            q(c,'select drain_sequence_reply_moves(100)')
            assert state(c,x)['stage_id']==x['stages'][2]['id']
            assert q(c,'select status from sequence_reply_moves where lead_id=%s',[x['lead']])[0]['status']=='cancelled'
            RESULTS.append(mode+'_manual_move_wins')
            # Four workers overlap inbound and a card writer. The card owner wins.
            x=setup(c,mode);a=connect();q(a,'begin')
            q(a,'select id from pipeline_leads where id=%s for update',[x['card']])
            inbound(c,x)
            q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
            futures=[pool.submit(q,connect(),'select drain_sequence_reply_moves(100)') for _ in range(4)]
            futures.append(pool.submit(inbound,connect(),x))
            for f in futures:f.result(8)
            q(a,'update pipeline_leads set stage_id=%s where id=%s',[x['stages'][2]['id'],x['card']]);q(a,'commit')
            q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
            q(c,'select drain_sequence_reply_moves(100)')
            assert state(c,x)['stage_id']==x['stages'][2]['id']
            RESULTS.append(mode+'_workers_inbound_manual_no_deadlock')
            # Concurrent workers after contention release converge to a single move.
            x=setup(c,mode);a=connect();q(a,'begin')
            q(a,'select id from pipeline_stages where id=%s for update',[x['stages'][1]['id']]);inbound(c,x);q(a,'commit')
            q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
            futures=[pool.submit(q,connect(),'select drain_sequence_reply_moves(100)') for _ in range(4)]
            for f in futures:f.result(8)
            assert state(c,x)['stage_id']==x['stages'][1]['id']
            assert q(c,'select count(*) n from movements where card=%s',[x['card']])[0]['n']==1
            RESULTS.append(mode+'_workers_exactly_one_move')
    for mode in ['legacy','ai_until_reply']:
        x=setup(c,mode)
        q(c,'select * from save_sequence(%s,%s,%s)',[B,x['seq'],json.dumps({'trigger_stage_id':None})])
        q(c,'update pipeline_leads set stage_id=%s,moved_at=clock_timestamp() where id=%s',[x['stages'][2]['id'],x['card']])
        inbound(c,x);stopped(c,x)
        assert state(c,x)['stage_id']==x['stages'][2]['id'], 'no-trigger enrollment must preserve later manual movement'
        RESULTS.append(mode+'_no_trigger_manual_wins')
    for mode in ['legacy','ai_until_reply']:
        for change in ['STOP','unknown','config','config-return','delete','owner','owner-return','archived','closed','manual-return','disabled','target-delete','target-owner','buyer-inactive']:
            x=setup(c,mode);a=connect();q(a,'begin')
            q(a,'select id from pipeline_stages where id=%s for update',[x['stages'][1]['id']]);inbound(c,x);q(a,'commit')
            if change=='STOP':inbound(c,x,'STOP')
            elif change=='unknown':q(c,"update sequence_enrollments set delivery_status='unknown' where id=%s",[x['e']])
            elif change in ('config','config-return'):
                q(c,'update sequences set reply_stage_id=null where id=%s',[x['seq']])
                if change=='config-return':q(c,'update sequences set reply_stage_id=%s where id=%s',[x['stages'][1]['id'],x['seq']])
            elif change=='delete':q(c,'delete from sequences where id=%s',[x['seq']])
            elif change in ('owner','owner-return'):
                q(c,'update leads set assigned_to=null where id=%s',[x['lead']])
                if change=='owner-return':q(c,'update leads set assigned_to=%s where id=%s',[B,x['lead']])
            elif change=='archived':q(c,'update leads set archived=true where id=%s',[x['lead']])
            elif change=='closed':q(c,'update leads set contract_closed=true where id=%s',[x['lead']])
            elif change=='disabled':q(c,'update sequences set enabled=false where id=%s',[x['seq']])
            elif change=='target-delete':q(c,'delete from pipeline_stages where id=%s',[x['stages'][1]['id']])
            elif change=='target-owner':
                other=q(c,'insert into buyers(id) values(gen_random_uuid()) returning id')[0]['id']
                q(c,'update pipelines set buyer_id=%s where id=(select pipeline_id from pipeline_stages where id=%s)',[other,x['stages'][1]['id']])
            elif change=='buyer-inactive':q(c,'update buyers set is_active=false where id=%s',[B])
            else:
                q(c,'update pipeline_leads set stage_id=%s where id=%s',[x['stages'][2]['id'],x['card']])
                q(c,'update pipeline_leads set stage_id=%s where id=%s',[x['stages'][0]['id'],x['card']])
            q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
            q(c,'select drain_sequence_reply_moves(100)')
            assert state(c,x)['stage_id']==x['stages'][0]['id'], change
            assert q(c,'select status,outcome from sequence_reply_moves where lead_id=%s',[x['lead']])[0]['status']=='cancelled',change
            RESULTS.append(mode+'_pending_cancel_'+change)
            if change=='buyer-inactive':q(c,'update buyers set is_active=true where id=%s',[B])
    x=setup(c)
    q(c,"create function slow_reply_fixture() returns trigger language plpgsql as $$ begin perform pg_sleep(1); return new; end $$; create trigger slow_reply_fixture before update on pipeline_leads for each row execute function slow_reply_fixture();")
    q(c,"set statement_timeout='150ms'")
    inbound(c,x)
    q(c,"set statement_timeout='6000ms'")
    stopped(c,x)
    assert q(c,'select status,last_sqlstate from sequence_reply_moves where lead_id=%s',[x['lead']])[0]=={'status':'pending','last_sqlstate':'57014'}
    q(c,'drop trigger slow_reply_fixture on pipeline_leads; drop function slow_reply_fixture()')
    q(c,"update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=%s",[x['lead']])
    q(c,'select drain_sequence_reply_moves(100)')
    assert state(c,x)['stage_id']==x['stages'][1]['id']
    RESULTS.append('real_statement_timeout_stop_and_intent_survive_then_drain')
    print(json.dumps({'passed':len(RESULTS),'results':RESULTS,'run':str(RUN)}),flush=True)
finally:
    for c in CONNS:c.close()
    if started:cmd(BIN/'pg_ctl','-D',RUN/'data','-m','fast','-w','stop')
    stopped_cluster=cmd(BIN/'pg_ctl','-D',RUN/'data','status',check=False).returncode==3
    (RUN/'summary.json').write_text(json.dumps({'passed':len(RESULTS),'results':RESULTS,'cluster_stopped':stopped_cluster},indent=2))
    assert stopped_cluster
