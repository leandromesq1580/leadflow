-- Run after migration 041 inside a transaction, then ROLLBACK.
-- Fictional fixtures only: no messages are sent and no rows are committed.
do $$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid();
  worker_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  other_member_id uuid := gen_random_uuid();
  pipe_id uuid := gen_random_uuid();
  worker_pipe uuid := gen_random_uuid();
  first_stage uuid := gen_random_uuid();
  same_stage uuid := gen_random_uuid();
  worker_stage uuid := gen_random_uuid();
  lead_id uuid := gen_random_uuid();
  seq_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into buyers(id, name, email, is_admin) values
    (owner_id, 'Reclaim test owner', owner_id || '@example.invalid', false),
    (worker_id, 'Reclaim test worker', worker_id || '@example.invalid', false),
    (outsider_id, 'Reclaim test outsider', outsider_id || '@example.invalid', false);
  insert into team_members(id, buyer_id, name, email) values
    (member_id, owner_id, 'Reclaim test member', worker_id || '@example.invalid'),
    (other_member_id, owner_id, 'Reclaim other member', null);
  insert into leads(id, name, phone, assigned_to, assigned_to_member, status, assigned_at)
    values(lead_id, 'FICTIONAL reclaim test', '+12025550100', owner_id, member_id, 'assigned', '2026-01-01');
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'code' = 'NO_PIPELINE', 'missing destination must not mutate';
  assert (select assigned_to_member = member_id from leads where id = lead_id);
  result := reclaim_team_lead(lead_id, outsider_id, member_id);
  assert result->>'code' = 'FORBIDDEN', 'other accounts cannot reclaim';
  result := reclaim_team_lead(lead_id, owner_id, other_member_id);
  assert result->>'code' = 'CONFLICT', 'stale member selection rejected';

  insert into pipelines(id, buyer_id, name, is_default) values
    (pipe_id, owner_id, 'Fixture owner', true), (worker_pipe, worker_id, 'Fixture worker', true);
  insert into pipeline_stages(id, pipeline_id, name, position) values
    (first_stage, pipe_id, 'Novo Lead', 0), (same_stage, pipe_id, 'Envio Proposta', 1),
    (worker_stage, worker_pipe, 'Envio Proposta', 0);
  insert into pipeline_leads(lead_id, pipeline_id, stage_id) values(lead_id, worker_pipe, worker_stage);
  insert into whatsapp_messages(buyer_id, lead_id, direction, from_phone, to_phone, body)
    values(worker_id, lead_id, 'in', '+12025550100', '+12025550101', 'Fictional history');
  insert into follow_ups(buyer_id, lead_id, description) values(worker_id, lead_id, 'Fictional follow-up');
  insert into credits(buyer_id, type, total_purchased, total_used) values(owner_id, 'lead', 10, 4);
  insert into sequences(id, buyer_id, name, enabled) values(seq_id, worker_id, 'Fictional disabled sequence', false);
  insert into sequence_enrollments(sequence_id, buyer_id, lead_id, status, next_run_at)
    values(seq_id, worker_id, lead_id, 'active', now() + interval '100 years');

  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'ok' = 'true', 'regular owner can reclaim own delegation';
  assert result->>'stage_id' = same_stage::text, 'preserve equivalent stage';
  assert (select assigned_to = owner_id and assigned_to_member is null and status = 'assigned'
    and assigned_at = '2026-01-01'::timestamptz from leads where id = lead_id);
  assert (select count(*) = 1 from pipeline_leads where pipeline_leads.lead_id = lead_id);
  assert (select buyer_id = owner_id and body = 'Fictional history' from whatsapp_messages where whatsapp_messages.lead_id = lead_id);
  assert (select count(*) = 1 from follow_ups where follow_ups.lead_id = lead_id);
  assert (select total_purchased = 10 and total_used = 4 from credits where buyer_id = owner_id);
  assert (select status = 'stopped' from sequence_enrollments where sequence_id = seq_id);
  assert (select count(*) = 1 from pipeline_moves where pipeline_moves.lead_id = lead_id);
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'already_owned' = 'true', 'retry is idempotent';
  assert (select count(*) = 1 from pipeline_moves where pipeline_moves.lead_id = lead_id);

  update leads set assigned_to = worker_id, assigned_to_member = null where id = lead_id;
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'code' = 'FORBIDDEN', 'non-admin cannot take member personal lead';
  update buyers set is_admin = true where id = owner_id;
  update leads set assigned_to = null where id = lead_id;
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'code' = 'FORBIDDEN', 'NULL ownership never bypasses permission';
  update leads set assigned_to = worker_id, archived = true where id = lead_id;
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'code' = 'ARCHIVED';
  update leads set archived = false where id = lead_id;
  delete from pipeline_leads where pipeline_leads.lead_id = lead_id;
  result := reclaim_team_lead(lead_id, owner_id, member_id);
  assert result->>'ok' = 'true', 'admin can reclaim direct team assignment without source card';
  assert result->>'stage_id' = first_stage::text, 'missing source falls back to first stage';
  result := reclaim_team_lead(gen_random_uuid(), owner_id, member_id);
  assert result->>'code' = 'NOT_FOUND';
  assert not has_function_privilege('anon', 'public.reclaim_team_lead(uuid,uuid,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.reclaim_team_lead(uuid,uuid,uuid)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.reclaim_team_lead(uuid,uuid,uuid)', 'EXECUTE');
end;
$$;
select 'PASS: reclaim transaction, permissions, history, credits, stage, retries' as test_result;
