-- Execute migration 043 and this fixture in BEGIN ... ROLLBACK.
-- All fixtures are fictional. No messages, credits or rows are committed.
do $$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid(); worker_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid(); conflict_member uuid := gen_random_uuid(); empty_member uuid := gen_random_uuid();
  owner_pipe uuid := gen_random_uuid(); worker_pipe uuid := gen_random_uuid(); owner_stage uuid := gen_random_uuid(); worker_stage uuid := gen_random_uuid();
  active_id uuid := gen_random_uuid(); archived_id uuid := gen_random_uuid(); personal_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid(); swap_id uuid;
  blocked boolean := false; result jsonb;
begin
  insert into buyers(id,name,email) values
    (owner_id,'Removal fixture owner',owner_id || '@example.invalid'),
    (worker_id,'Removal fixture worker',worker_id || '@example.invalid'),
    (outsider_id,'Removal fixture outsider',outsider_id || '@example.invalid');
  insert into team_members(id,buyer_id,name,email) values
    (member_id,owner_id,'Removal fixture member',worker_id || '@example.invalid'),
    (conflict_member,owner_id,'Removal conflict member',null),
    (empty_member,owner_id,'Removal empty member',null);
  insert into pipelines(id,buyer_id,name,is_default) values
    (owner_pipe,owner_id,'Removal owner pipeline',true),(worker_pipe,worker_id,'Removal worker pipeline',true);
  insert into pipeline_stages(id,pipeline_id,name,position) values
    (owner_stage,owner_pipe,'Proposta',0),(worker_stage,worker_pipe,'Proposta',0);
  insert into leads(id,name,phone,assigned_to,assigned_to_member,archived,status,assigned_at) values
    (active_id,'FICTIONAL active removal lead','+12025550100',owner_id,member_id,false,'assigned','2026-01-01'),
    (archived_id,'FICTIONAL archived removal lead','+12025550101',owner_id,member_id,true,'assigned','2026-01-01'),
    (personal_id,'FICTIONAL personal worker lead','+12025550102',worker_id,null,false,'assigned','2026-01-01');
  insert into pipeline_leads(lead_id,pipeline_id,stage_id) values
    (active_id,worker_pipe,worker_stage),(archived_id,worker_pipe,worker_stage),(personal_id,worker_pipe,worker_stage);
  insert into follow_ups(lead_id,buyer_id,description) values
    (active_id,worker_id,'Fictional active history'),(archived_id,worker_id,'Fictional archived history');
  insert into whatsapp_messages(lead_id,buyer_id,direction,from_phone,to_phone,body) values
    (active_id,worker_id,'in','12025550100','12025550103','Fictional active message'),
    (archived_id,worker_id,'in','12025550101','12025550103','Fictional archived message');
  insert into credits(buyer_id,type,total_purchased,total_used) values(owner_id,'lead',10,4);

  -- Reproduce the old button's exact database failure, safely rolled back.
  begin
    delete from team_members where id = member_id;
  exception when foreign_key_violation then blocked := true;
  end;
  assert blocked, 'old DELETE is blocked by linked leads';

  result := remove_team_member(member_id,outsider_id);
  assert result->>'code' = 'FORBIDDEN', 'unrelated buyer cannot remove a member';
  assert exists(select 1 from team_members where id = member_id);
  result := remove_team_member(member_id,owner_id);
  assert result->>'ok' = 'true' and result->>'returned_leads' = '2' and result->>'archived_leads' = '1';
  assert not exists(select 1 from team_members where id = member_id);
  assert (select count(*) = 2 from leads where id in (active_id,archived_id) and assigned_to = owner_id and assigned_to_member is null and assigned_at = '2026-01-01'::timestamptz and status = 'assigned');
  assert (select archived is true from leads where id = archived_id), 'archived lead must NOT re-enter active routing';
  assert (select archived is false from leads where id = active_id);
  assert (select count(*) = 1 from pipeline_leads where lead_id = active_id and pipeline_id = owner_pipe and stage_id = owner_stage);
  assert (select count(*) = 0 from pipeline_leads where lead_id in (active_id,archived_id) and pipeline_id = worker_pipe);
  assert (select count(*) = 1 from pipeline_leads where lead_id = personal_id and pipeline_id = worker_pipe), 'worker personal leads must not move';
  assert (select assigned_to = worker_id from leads where id = personal_id);
  assert (select count(*) = 2 from follow_ups where lead_id in (active_id,archived_id)), 'history preserved';
  assert (select count(*) = 2 from whatsapp_messages where lead_id in (active_id,archived_id) and buyer_id = owner_id), 'messages preserved with owner';
  assert (select total_purchased = 10 and total_used = 4 from credits where buyer_id = owner_id), 'credits unchanged';
  assert (select value->'member'->>'name' = 'Removal fixture member' from settings where key = 'team_member_removal:' || member_id), 'recoverable membership audit';
  result := remove_team_member(member_id,owner_id);
  assert result->>'already_removed' = 'true', 'retry is idempotent';
  assert (select count(*) = 1 from settings where key = 'team_member_removal:' || member_id);
  result := remove_team_member(empty_member,owner_id);
  assert result->>'ok' = 'true' and result->>'returned_leads' = '0', 'empty member removal';

  -- The first loop iteration mutates, the second fails. Everything must roll back.
  if first_id > second_id then swap_id := first_id; first_id := second_id; second_id := swap_id; end if;
  insert into leads(id,name,phone,assigned_to,assigned_to_member,archived) values
    (first_id,'FICTIONAL rollback first','12025550104',owner_id,conflict_member,true),
    (second_id,'FICTIONAL rollback second','12025550105',outsider_id,conflict_member,true);
  blocked := false;
  begin
    result := remove_team_member(conflict_member,owner_id);
  exception when raise_exception then
    assert sqlerrm = 'TEAM_REMOVAL_CONFLICT'; blocked := true;
  end;
  assert blocked;
  assert exists(select 1 from team_members where id = conflict_member);
  assert (select assigned_to_member = conflict_member from leads where id = first_id), 'no partial removal';
  assert not exists(select 1 from settings where key = 'team_member_removal:' || conflict_member);
  assert not has_function_privilege('anon','public.remove_team_member(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.remove_team_member(uuid,uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.remove_team_member(uuid,uuid)','EXECUTE');
end;
$$;
select 'PASS: old FK reproduced; active + archived removal; history, ownership, credits, idempotency, permissions, rollback' as result;
