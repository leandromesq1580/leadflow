#!/usr/bin/env python3
"""Real independent PostgreSQL connections; synthetic local-only cluster, immutable SQL snapshots.
Usage: venv/bin/python harness.py [--migration /absolute/052.sql] [--label name]
Dependencies: locally extracted postgresql-16; isolated psycopg[binary] venv.
Never reads .env. Every run initializes a new cluster; always stops it in finally.
"""
import argparse, concurrent.futures, hashlib, json, os, pathlib, re, subprocess, time, traceback
import psycopg
from psycopg.rows import dict_row
# Explicit local-only binary tree; no connection string or production credentials.
ROOT=pathlib.Path(os.environ['TMPDIR'])/'ai-sequence-pg-regression'
ROOT.mkdir(parents=True,exist_ok=True)
REPO=pathlib.Path(__file__).resolve().parents[1]
PG=pathlib.Path(os.environ['L4P_TEST_PG_ROOT'])
BIN=PG/'usr/lib/postgresql/16/bin'
SHARE=PG/'usr/share/postgresql/16'
B='00000000-0000-4000-8000-000000000001'
O='00000000-0000-4000-8000-000000000002'
L='00000000-0000-4000-8000-000000000003'
S='00000000-0000-4000-8000-000000000004'
ENV={'PATH':'/usr/bin:/bin','HOME':os.environ['HOME'],'LANG':'C.UTF-8','TMPDIR':str(ROOT)}
args=argparse.ArgumentParser();args.add_argument('--migration',default=str(REPO/'supabase/migrations/052_ai_sequences_until_reply.sql'));args.add_argument('--label',default='snapshot');args=args.parse_args()
assert re.fullmatch('[a-zA-Z0-9_-]+',args.label)
RUN=ROOT/(args.label+'-'+str(time.time_ns()));RUN.mkdir()
SOCK=ROOT/('s'+str(os.getpid()));SOCK.mkdir(mode=0o700)
LOG=(RUN/'events.jsonl').open('w')
def log(event,**kw):
    data={'event':event,**kw};line=json.dumps(data,default=str);print(line,flush=True);LOG.write(line+'\n');LOG.flush()
def cmd(*a):
    p=subprocess.run([str(x) for x in a],env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=40)
    log('command',argv=list(map(str,a)),rc=p.returncode,output=p.stdout);p.check_returncode();return p
sql=pathlib.Path(args.migration).read_bytes();(RUN/'052.sql').write_bytes(sql)
base=(REPO/'supabase/migrations/006_inbox_sequences_ai_push.sql').read_text().split('-- AI LEAD SCORING')[0];(RUN/'006-prefix.sql').write_text(base)
test=(REPO/'tests/ai-sequence-sql.test.ts').read_text()
fixture=re.search(r'await db.exec\(`(.*?)`\)',test,re.S).group(1)
(RUN/'fixture.sql').write_text(fixture)
log('snapshot',migration_sha256=hashlib.sha256(sql).hexdigest(),base_sha256=hashlib.sha256(base.encode()).hexdigest(),fixture_sha256=hashlib.sha256(fixture.encode()).hexdigest(),run=str(RUN))
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=6)
connections=[]
def connect(db):
    c=psycopg.connect(host=str(SOCK),port=55439,user=__import__('getpass').getuser(),dbname=db,autocommit=True,row_factory=dict_row,connect_timeout=3,options='-c statement_timeout=7000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000 -c deadlock_timeout=500')
    connections.append(c);return c
def q(c,sql,params=None):
    cur=c.execute(sql,params)
    return cur.fetchall() if cur.description else []
def bg(c,sql,params=None):return POOL.submit(q,c,sql,params)
def observe(o,a,b,f):
    end=time.monotonic()+2
    while time.monotonic()<end:
        r=q(o,'select pg_blocking_pids(%s) blockers',[b.info.backend_pid])[0]['blockers']
        if r:
            log('blocking',blocker_pid=a.info.backend_pid,waiter_pid=b.info.backend_pid,blockers=r)
            return r
        if f.done():log('completed_without_block',waiter_pid=b.info.backend_pid);return []
        time.sleep(.02)
    log('no_block_observed',waiter_pid=b.info.backend_pid);return []
def state(o):return q(o,"select status,stop_reason,delivery_status,current_step,attempts,lease_token from sequence_enrollments")
def setup(enroll=True,claim=False,begin=False):
    global number
    number+=1;db='case_'+str(number)
    q(admin,f'CREATE DATABASE {db} TEMPLATE fixture_base')
    a,b,o=connect(db),connect(db),connect(db)
    q(o,'insert into buyers(id) values(%s),(%s)',[B,O]);q(o,'insert into leads(id,assigned_to) values(%s,%s)',[L,B])
    q(o,"insert into sequences(id,buyer_id,name,enabled,mode,ai_config) values(%s,%s,'synthetic',true,'ai_until_reply','{}')",[S,B])
    e=t=None
    if enroll:e=q(o,'select id from enroll_sequence(%s,%s,%s,now()-interval \'1 minute\')',[B,S,L])[0]['id']
    if claim:t=q(o,'select lease_token from claim_ai_sequence(%s)',[e])[0]['lease_token']
    if begin:q(o,'select id from begin_ai_send(%s,%s,%s)',[e,t,'synthetic'])
    log('connections',database=db,pids=[a.info.backend_pid,b.info.backend_pid,o.info.backend_pid])
    return a,b,o,e,t
INBOUND="insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,sent_at) values(%s,%s,'in','fixture','fixture',%s,clock_timestamp())"
ENROLL='select id from enroll_sequence(%s,%s,%s,clock_timestamp()-interval \'1 minute\')'
BEGIN='select id from begin_ai_send(%s,%s,%s)'
FINISH="select finish_ai_send(%s,%s,'wa-synthetic','0:0',clock_timestamp()+interval '1 day','fixture','fixture') ok"
results=[];number=0

def case(name,fn):
    log('case_start',name=name);start=len(connections)
    try:fn();results.append({'case':name,'ok':True});log('PASS',name=name)
    except Exception as ex:
        results.append({'case':name,'ok':False,'error':str(ex),'type':type(ex).__name__});log('FAIL',name=name,error=str(ex),trace=traceback.format_exc())
    finally:
        for c in connections[start:]:
            try:c.close()
            except Exception:pass

def claim_race():
    a,b,o,e,t=setup();q(a,'begin');r1=q(a,'select id from claim_ai_sequence(%s)',[e]);r2=bg(b,'select id from claim_ai_sequence(%s)',[e]).result(3);q(a,'commit')
    log('claim_results',first=r1,second=r2,state=state(o));assert len(r1)==1 and len(r2)==0

def begin_inbound(inbound_first):
    a,b,o,e,t=setup(claim=True);q(a,'begin')
    first=(INBOUND,[B,L,'reply']) if inbound_first else (BEGIN,[e,t,'synthetic'])
    second=(BEGIN,[e,t,'synthetic']) if inbound_first else (INBOUND,[B,L,'reply'])
    r=q(a,*first);f=bg(b,*second);observe(o,a,b,f);q(a,'commit');r2=f.result(9)
    s=state(o);log('outcome',first=r,second=r2,state=s);assert s[0]['status']=='stopped'
    if inbound_first:assert not r2
    else:assert len(r)==1

def enroll_inbound(enroll_first,optout=False):
    a,b,o,e,t=setup(enroll=False);q(a,'begin')
    incoming=(INBOUND,[B,L,'STOP' if optout else 'reply'])
    first=(ENROLL,[B,S,L]) if enroll_first else incoming
    second=incoming if enroll_first else (ENROLL,[B,S,L])
    r=q(a,*first);f=bg(b,*second);observe(o,a,b,f);q(a,'commit')
    try:r2=f.result(9)
    except psycopg.Error as ex:
        log('enroll_exception',sqlstate=ex.sqlstate,error=str(ex),state=state(o))
        if not enroll_first and optout and 'optout' in str(ex):return
        raise
    s=state(o);log('outcome',first=r,second=r2,state=s)
    if enroll_first:assert s and s[0]['status']=='stopped','inbound committed after enrollment escaped stop'
    else:assert not optout and s and s[0]['status']=='active','historical inbound should allow new enrollment'

def begin_delete(delete_first):
    a,b,o,e,t=setup(claim=True);q(a,'begin')
    first=('delete from sequences where id=%s',[S]) if delete_first else (BEGIN,[e,t,'synthetic'])
    second=(BEGIN,[e,t,'synthetic']) if delete_first else ('delete from sequences where id=%s',[S])
    r=q(a,*first);f=bg(b,*second);observe(o,a,b,f);q(a,'commit');r2=f.result(9)
    sup=q(o,'select reason from ai_sequence_suppressions');log('outcome',first=r,second=r2,state=state(o),suppressions=sup)
    if delete_first:assert not r2
    else:assert any(x['reason']=='delivery_unknown' for x in sup),'delete during authorized transport lost durable suppression'

def mutation_begin(kind,mutation_first):
    a,b,o,e,t=setup(claim=True)
    mutations={'transfer':('update leads set assigned_to=%s where id=%s',[O,L]),'sale':('update leads set contract_closed=true where id=%s',[L]),'suspension':('update buyers set is_active=false where id=%s',[B])}
    mut=mutations[kind];q(a,'begin');r=q(a,*(mut if mutation_first else (BEGIN,[e,t,'synthetic'])));f=bg(b,*((BEGIN,[e,t,'synthetic']) if mutation_first else mut));observe(o,a,b,f);q(a,'commit');r2=f.result(9)
    s=state(o);log('outcome',first=r,second=r2,state=s);assert s[0]['status']!='active'
    if mutation_first:assert not r2,'send was authorized while permission mutation was in flight'

def enroll_mutation(kind,mutation_first):
    a,b,o,e,t=setup(enroll=False)
    mutations={'transfer':('update leads set assigned_to=%s where id=%s',[O,L]),'sale':('update leads set contract_closed=true where id=%s',[L]),'suspension':('update buyers set is_active=false where id=%s',[B])}
    mut=mutations[kind];q(a,'begin');r=q(a,*(mut if mutation_first else (ENROLL,[B,S,L])));f=bg(b,*((ENROLL,[B,S,L]) if mutation_first else mut));observe(o,a,b,f);q(a,'commit')
    try:r2=f.result(9)
    except psycopg.Error as ex:
        log('enroll_exception',sqlstate=ex.sqlstate,error=str(ex),state=state(o))
        if mutation_first and ex.sqlstate in ('23514','42501'):return
        raise
    s=state(o);log('outcome',first=r,second=r2,state=s);assert not any(x['status']=='active' for x in s),'enrollment committed active after permission revoked'

def finish_inbound(inbound_first):
    a,b,o,e,t=setup(claim=True,begin=True);q(a,'begin')
    first=(INBOUND,[B,L,'reply']) if inbound_first else (FINISH,[e,t])
    second=(FINISH,[e,t]) if inbound_first else (INBOUND,[B,L,'reply'])
    r=q(a,*first);f=bg(b,*second);observe(o,a,b,f);q(a,'commit');r2=f.result(9);s=state(o)
    log('outcome',first=r,second=r2,state=s);assert s[0]['status']=='stopped' and s[0]['current_step']==1

def exception_closed():
    a,b,o,e,t=setup(claim=True,begin=True)
    try:q(a,"select finish_ai_send(%s,%s,null,'0:0',now(),'fixture','fixture')",[e,t]);raise AssertionError('expected missing ACK exception')
    except psycopg.Error as ex:assert 'missing_delivery_confirmation' in str(ex);log('expected_exception',sqlstate=ex.sqlstate,error=str(ex))
    assert state(o)[0]['current_step']==0
    q(o,"update sequence_enrollments set lease_until=now()-interval '1 second'")
    r=q(b,'select id from claim_ai_sequence(%s)',[e]);s=state(o);log('outcome',claim=r,state=s);assert not r and s[0]['status']=='paused' and s[0]['delivery_status']=='unknown'

def finish_inbound_lock_inversion():
    # Pause finish immediately after its enrollment row lock, without changing product SQL.
    a,b,o,e,t=setup(claim=True,begin=True);q(a,'begin')
    q(a,'select id from sequence_enrollments where id=%s for update',[e])
    f=bg(b,INBOUND,[B,L,'reply']);blockers=observe(o,a,b,f)
    assert a.info.backend_pid in blockers,'expected inbound to wait on enrollment row'
    errors=[]
    try:r=q(a,FINISH,[e,t]);q(a,'commit')
    except psycopg.Error as ex:
        errors.append({'side':'finish','sqlstate':ex.sqlstate,'error':str(ex)});q(a,'rollback')
    try:r2=f.result(9)
    except psycopg.Error as ex:errors.append({'side':'inbound','sqlstate':ex.sqlstate,'error':str(ex)})
    log('lock_inversion_outcome',errors=errors,state=state(o))
    assert not errors,'deadlock/timeout between inbound lead lock and finish outbound foreign key: '+str(errors)
    assert state(o)[0]['status']=='stopped'


def suppression_inbound_inversion(kind):
    a,b,o,e,t=setup(claim=True,begin=kind=='claim')
    if kind=='claim':q(o,"update sequence_enrollments set lease_until=now()-interval '1 second' where id=%s",[e])
    q(a,'begin')
    q(a,'select id from sequence_enrollments where id=%s for update',[e])
    f=bg(b,INBOUND,[B,L,'STOP'])
    blockers=observe(o,a,b,f)
    assert a.info.backend_pid in blockers
    errors=[]
    try:
        if kind=='stop':q(a,'select stop_sequence_enrollment(%s,%s)',[B,e])
        else:q(a,'select id from claim_ai_sequence(%s)',[e])
        q(a,'commit')
    except psycopg.Error as ex:
        errors.append({'side':kind,'sqlstate':ex.sqlstate,'error':str(ex)});q(a,'rollback')
    try:f.result(9)
    except psycopg.Error as ex:errors.append({'side':'inbound','sqlstate':ex.sqlstate,'error':str(ex)})
    log('residual_outcome',kind=kind,errors=errors,state=state(o),suppressions=q(o,'select reason from ai_sequence_suppressions'),inbound=q(o,"select count(*) n from whatsapp_messages where direction='in'"))
    assert not errors,'suppression/enrollment lock inversion: '+str(errors)
    assert q(o,"select count(*) n from whatsapp_messages where direction='in'")[0]['n']==1
    assert q(o,'select reason from ai_sequence_suppressions')[0]['reason']=='optout'

def parent_delete(kind):
    a,b,o,e,t=setup(claim=True,begin=True)
    if kind=='unknown':q(o,"select defer_ai_sequence(%s,%s,'delivery_unknown',now(),true)",[e,t])
    q(o,'update leads set archived=true where id=%s',[L])
    try:
        q(a,('delete from buyers where id=%s' if kind=='buyer' else 'delete from leads where id=%s'),[B if kind=='buyer' else L])
    except psycopg.Error as ex:
        log('residual_delete_error',kind=kind,sqlstate=ex.sqlstate,error=str(ex),state=state(o));raise
    log('residual_delete_success',kind=kind,state=state(o))


def suppression_other_inversion(kind):
    a,b,o,e,t=setup(claim=True,begin=True)
    q(a,'begin');q(a,'select id from sequence_enrollments where id=%s for update',[e])
    if kind=='defer':f=bg(b,"select defer_ai_sequence(%s,%s,'delivery_unknown',now(),true)",[e,t])
    else:f=bg(b,'update leads set sms_opted_out=true where id=%s',[L])
    assert a.info.backend_pid in observe(o,a,b,f)
    errors=[]
    try:q(a,'select stop_sequence_enrollment(%s,%s)',[B,e]);q(a,'commit')
    except psycopg.Error as ex:errors.append({'side':'stop','sqlstate':ex.sqlstate,'error':str(ex)});q(a,'rollback')
    try:f.result(9)
    except psycopg.Error as ex:errors.append({'side':kind,'sqlstate':ex.sqlstate,'error':str(ex)})
    log('other_outcome',kind=kind,errors=errors,state=state(o),suppressions=q(o,'select reason from ai_sequence_suppressions'))
    assert not errors,str(errors)
    if kind=='lead':assert q(o,'select reason from ai_sequence_suppressions')[0]['reason']=='optout'

started=False
try:
    cmd(BIN/'initdb','-D',RUN/'data','-L',SHARE,'--no-locale','--encoding=UTF8','--auth=trust','--username='+__import__('getpass').getuser())
    cmd(BIN/'pg_ctl','-D',RUN/'data','-l',RUN/'postgres.log','-o',f"-c listen_addresses='' -c unix_socket_directories='{SOCK}' -c port=55439 -c shared_preload_libraries=''",'-w','start');started=True
    admin=connect('postgres');log('server',version=q(admin,'select version(), current_setting(\'listen_addresses\') listen_addresses'))
    q(admin,'CREATE DATABASE fixture_base');fbase=connect('fixture_base');q(fbase,fixture);q(fbase,base);q(fbase,sql.decode());fbase.close()
    case('two_claims_one_winner',claim_race)
    for first in (True,False):case('begin_inbound_'+('inbound_first' if first else 'begin_first'),lambda first=first:begin_inbound(first))
    for first in (True,False):case('enroll_inbound_'+('enroll_first' if first else 'inbound_first'),lambda first=first:enroll_inbound(first))
    case('enroll_after_optout',lambda:enroll_inbound(False,True))
    for first in (True,False):case('begin_delete_'+('delete_first' if first else 'begin_first'),lambda first=first:begin_delete(first))
    for kind in ('transfer','sale','suspension'):
        for first in (True,False):
            case('begin_'+kind+'_'+('mutation_first' if first else 'begin_first'),lambda first=first,kind=kind:mutation_begin(kind,first))
            case('enroll_'+kind+'_'+('mutation_first' if first else 'enroll_first'),lambda first=first,kind=kind:enroll_mutation(kind,first))
    for first in (True,False):case('finish_inbound_'+('inbound_first' if first else 'finish_first'),lambda first=first:finish_inbound(first))
    case('missing_ack_exception_fail_closed',exception_closed)
    case('finish_inbound_lock_inversion',finish_inbound_lock_inversion)
    case('stop_vs_defer',lambda:suppression_other_inversion('defer'))
    case('stop_vs_lead_optout',lambda:suppression_other_inversion('lead'))
    case('stop_optout_suppression_lock_inversion',lambda:suppression_inbound_inversion('stop'))
    case('expired_claim_optout_suppression_lock_inversion',lambda:suppression_inbound_inversion('claim'))
    case('delete_archived_lead_sending',lambda:parent_delete('sending'))
    case('delete_archived_lead_unknown',lambda:parent_delete('unknown'))
    case('delete_buyer_sending',lambda:parent_delete('buyer'))
finally:
    for c in connections:
        try:c.close()
        except Exception:pass
    POOL.shutdown(wait=True,cancel_futures=True)
    if started:cmd(BIN/'pg_ctl','-D',RUN/'data','-m','fast','-w','stop')
    p=subprocess.run([str(BIN/'pg_ctl'),'-D',str(RUN/'data'),'status'],env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    log('cluster_stopped',status_rc=p.returncode,output=p.stdout);assert p.returncode==3
    summary={'migration_sha256':hashlib.sha256(sql).hexdigest(),'passed':sum(r['ok'] for r in results),'failed':sum(not r['ok'] for r in results),'results':results,'cluster_stopped':True,'run':str(RUN)}
    (RUN/'summary.json').write_text(json.dumps(summary,indent=2));log('summary',**summary)
    LOG.close()
raise SystemExit(1 if any(not r['ok'] for r in results) else 0)