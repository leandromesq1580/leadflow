"""Local-only PostgreSQL multi-session regression for migration 070.
PG_BIN must point to local PostgreSQL binaries. Creates a disposable cluster under TMPDIR,
no TCP and no production credentials. Leaves its private evidence directory intact.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import time
from typing import Literal, overload

ROOT = pathlib.Path(__file__).resolve().parents[1]
BIN = pathlib.Path(os.environ['PG_BIN'])
WORK = pathlib.Path(tempfile.mkdtemp(prefix='sms-pg-', dir=os.environ['TMPDIR']))
DATA = WORK / 'data'
SOCKET = WORK / 's'
SOCKET.mkdir()
PSQL = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(SOCKET), '-p', '55439', '-U', os.environ.get('USER', 'hermes'), '-d', 'postgres']
LEAD = '11111111-1111-4111-8111-111111111111'
OWNER = '22222222-2222-4222-8222-222222222222'
OTHER = '55555555-5555-4555-8555-555555555555'
MSG = '33333333-3333-4333-8333-333333333333'
OUT = '66666666-6666-4666-8666-666666666666'
CALL = f"SELECT public.link_orphan_sms_reply('{MSG}','{LEAD}','{OWNER}')"
held = []
results = []

@overload
def sql(command: str, ok: Literal[True] = True) -> str: ...
@overload
def sql(command: str, ok: Literal[False]) -> subprocess.CompletedProcess[str]: ...
def sql(command: str, ok: bool = True):
    p = subprocess.run(PSQL + ['-c', command], text=True, capture_output=True, timeout=5)
    if ok and p.returncode:
        raise AssertionError(p.stderr)
    return p.stdout.strip() if ok else p

def hold(command):
    p = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    held.append(p)
    assert p.stdin is not None and p.stdout is not None and p.stderr is not None
    p.stdin.write(command + "; SELECT 'READY';\n")
    p.stdin.flush()
    for line in p.stdout:
        if line.strip() == 'READY':
            return p
    raise AssertionError('Holder failed: ' + p.stderr.read())

def release(p, commit=False):
    p.stdin.write('COMMIT;\n' if commit else 'ROLLBACK;\n')
    p.stdin.close()
    p.wait(timeout=5)
    assert p.returncode == 0, p.stderr.read()
    held.remove(p)

def check(label, fn):
    fn()
    results.append(label)
    print('PASS ' + label, flush=True)

started = False
try:
    subprocess.run([str(BIN / 'initdb'), '-D', str(DATA), '-A', 'trust', '--no-locale', '-E', 'UTF8'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(BIN / 'pg_ctl'), '-D', str(DATA), '-l', str(WORK / 'postgres.log'), '-o', f"-F -k {SOCKET} -p 55439 -c listen_addresses=''", '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    started = True
    sql((ROOT / 'tests/fixtures/sms-link-schema.sql').read_text())
    sql((ROOT / 'supabase/migrations/070_link_orphan_sms_reply.sql').read_text())
    sql(f"INSERT INTO leads(id,phone,assigned_to) VALUES('{LEAD}','202 555 0123','{OWNER}'); INSERT INTO sms_messages(id,lead_id,direction,status,from_phone,to_phone,body,twilio_sid,created_at) VALUES ('{MSG}',NULL,'in','received','12025550123','18885550100','Synthetic historical reply','SM_synthetic','2026-03-01T12:00:00Z'), ('{OUT}','{LEAD}','out','sent',NULL,'12025550123','Synthetic outbound','SM_out','2026-03-01T11:00:00Z')")
    before = sql(f"SELECT to_jsonb(m)-'lead_id' FROM sms_messages m WHERE id='{MSG}'")

    def denied_roles():
        for role in ['anon', 'authenticated']:
            p = sql(f'SET ROLE {role}; {CALL}', ok=False)
            assert p.returncode != 0 and 'permission denied' in p.stderr
    check('non-service roles cannot recover replies', denied_roles)

    def owner_changes_first():
        p = hold(f"BEGIN; UPDATE leads SET assigned_to='{OTHER}' WHERE id='{LEAD}'")
        start = time.monotonic()
        assert json.loads(sql(CALL))['reason'] == 'busy'
        assert time.monotonic() - start < 1
        assert sql(f"SELECT lead_id IS NULL FROM sms_messages WHERE id='{MSG}'") == 't'
        release(p, commit=True)
        assert json.loads(sql(CALL))['reason'] == 'owner_changed'
        assert sql(f"SELECT lead_id IS NULL FROM sms_messages WHERE id='{MSG}'") == 't'
        sql(f"UPDATE leads SET assigned_to='{OWNER}' WHERE id='{LEAD}'")
    check('concurrent reassignment is refused during and after commit', owner_changes_first)

    def recovery_locks_first():
        p = hold('BEGIN; ' + CALL)
        lock = sql(f"SELECT id FROM leads WHERE id='{LEAD}' FOR UPDATE NOWAIT", ok=False)
        assert lock.returncode != 0 and 'could not obtain lock' in lock.stderr
        assert json.loads(sql(CALL))['reason'] == 'busy'
        release(p)
        assert sql(f"SELECT lead_id IS NULL FROM sms_messages WHERE id='{MSG}'") == 't'
    check('recovery locks owner and message through commit; competing operator is refused', recovery_locks_first)

    def implicit_table_lock():
        p = hold('BEGIN; LOCK sms_messages IN SHARE MODE')
        start = time.monotonic()
        assert json.loads(sql(CALL))['reason'] == 'busy'
        assert time.monotonic() - start < 1
        assert sql(f"SELECT lead_id IS NULL FROM sms_messages WHERE id='{MSG}'") == 't'
        sql(f"SELECT id FROM leads WHERE id='{LEAD}' FOR UPDATE NOWAIT")
        release(p)
    check('implicit write lock times out and releases lead without partial repair', implicit_table_lock)

    def successful_link():
        result = json.loads(sql('SET ROLE service_role; ' + CALL))
        assert result == {'ok': True, 'already_linked': False}
        assert sql(f"SELECT lead_id FROM sms_messages WHERE id='{MSG}'") == LEAD
        assert sql(f"SELECT to_jsonb(m)-'lead_id' FROM sms_messages m WHERE id='{MSG}'") == before
        assert sql('SELECT count(*) FROM sms_messages') == '2'
        assert json.loads(sql(CALL)) == {'ok': True, 'already_linked': True}
    check('service-role recovery preserves all other columns and is idempotent', successful_link)

    def write_failure():
        sql(f"UPDATE sms_messages SET lead_id=NULL WHERE id='{MSG}'")
        sql("CREATE FUNCTION fail_sms_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER synthetic_failure BEFORE UPDATE ON sms_messages FOR EACH ROW EXECUTE FUNCTION fail_sms_update()")
        p = sql(CALL, ok=False)
        assert p.returncode != 0 and 'synthetic write failure' in p.stderr
        assert sql(f"SELECT lead_id IS NULL FROM sms_messages WHERE id='{MSG}'") == 't'
        sql(f"SELECT id FROM leads WHERE id='{LEAD}' FOR UPDATE NOWAIT")
    check('write error rolls back and releases locks', write_failure)
    print(json.dumps({'passed': len(results), 'failed': 0, 'evidence': str(WORK)}), flush=True)
finally:
    for p in held:
        try:
            release(p)
        except Exception:
            p.kill()
            p.wait()
    if started:
        subprocess.run([str(BIN / 'pg_ctl'), '-D', str(DATA), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
        print('LOCAL_POSTGRES_STOPPED', flush=True)
