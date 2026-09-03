-- Reclaim one team lead atomically. No credit/payment mutation and no deletion
-- of lead history. Only the server's service_role may invoke this function.
create or replace function public.reclaim_team_lead(
  p_lead_id uuid,
  p_actor_buyer_id uuid,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor public.buyers%rowtype;
  item public.leads%rowtype;
  member public.team_members%rowtype;
  member_buyer_id uuid;
  target_pipe uuid;
  target_stage uuid;
  source_card record;
  destination_card uuid;
begin
  select * into actor from public.buyers where id = p_actor_buyer_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;

  select * into item from public.leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if item.archived then return jsonb_build_object('ok', false, 'code', 'ARCHIVED'); end if;
  -- Repeated clicks/retries must not move stages or append duplicate audit rows.
  if item.assigned_to = actor.id and item.assigned_to_member is null then
    return jsonb_build_object('ok', true, 'already_owned', true, 'lead_id', item.id);
  end if;

  select * into member from public.team_members
    where id = coalesce(p_member_id, item.assigned_to_member) and buyer_id = actor.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if item.assigned_to_member is not null and item.assigned_to_member <> member.id then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT');
  end if;

  if member.auth_user_id is not null then
    select id into member_buyer_id from public.buyers where auth_user_id = member.auth_user_id;
  end if;
  if member_buyer_id is null and nullif(trim(member.email), '') is not null then
    select id into member_buyer_id from public.buyers
      where lower(trim(email)) = lower(trim(member.email));
  end if;

  -- Regular owners may reclaim their own delegated leads. An admin may also
  -- reclaim a directly assigned lead from their selected team member (legacy
  -- employee routing). Team visibility alone never grants this permission.
  if not coalesce((
    (item.assigned_to = actor.id and item.assigned_to_member = member.id)
    or (actor.is_admin is true and member_buyer_id is not null
        and member_buyer_id <> actor.id and item.assigned_to = member_buyer_id)
  ), false) then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;

  select p.id into target_pipe from public.pipelines p
    where p.buyer_id = actor.id
      and exists(select 1 from public.pipeline_stages s where s.pipeline_id = p.id)
    order by p.is_default desc nulls last, p.created_at, p.id limit 1;
  if target_pipe is null then return jsonb_build_object('ok', false, 'code', 'NO_PIPELINE'); end if;

  select pl.id, pl.pipeline_id, pl.stage_id, s.name as stage_name into source_card
    from public.pipeline_leads pl join public.pipeline_stages s on s.id = pl.stage_id
    join public.pipelines p on p.id = pl.pipeline_id
    where pl.lead_id = item.id and p.buyer_id is distinct from actor.id
    order by pl.moved_at desc nulls last, pl.id limit 1;

  -- Keep an existing owner card; otherwise preserve the current stage by name
  -- when the destination has an equivalent stage. Fall back to its first stage.
  select id, stage_id into destination_card, target_stage from public.pipeline_leads
    where lead_id = item.id and pipeline_id = target_pipe;
  if destination_card is null then
    select s.id into target_stage from public.pipeline_stages s where s.pipeline_id = target_pipe
      order by (lower(trim(s.name)) = lower(trim(source_card.stage_name))) desc nulls last,
        s.position, s.id limit 1;
    insert into public.pipeline_leads(lead_id, pipeline_id, stage_id, position, moved_at)
      values(item.id, target_pipe, target_stage, 0, now()) returning id into destination_card;
  end if;

  update public.leads set assigned_to = actor.id, assigned_to_member = null where id = item.id;
  -- Also works when the original assigned_to stays unchanged (delegated lead).
  update public.whatsapp_messages set buyer_id = actor.id
    where lead_id = item.id and buyer_id is distinct from actor.id;
  delete from public.pipeline_leads pl using public.pipelines p
    where pl.pipeline_id = p.id and pl.lead_id = item.id and p.buyer_id is distinct from actor.id;
  -- Do not let the previous handler's automated sequence keep messaging after
  -- the transfer. Keep enrollment history and never auto-enroll on reclaim.
  update public.sequence_enrollments set status = 'stopped'
    where lead_id = item.id and buyer_id <> actor.id and status = 'active';

  insert into public.pipeline_moves(lead_id, pipeline_id, stage_id, from_pipeline_id,
    from_stage_id, action, via, actor_buyer_id, actor_auth_user_id)
    values(item.id, target_pipe, target_stage, source_card.pipeline_id, source_card.stage_id,
      'move', 'POST /api/team/reclaim', actor.id, actor.auth_user_id);
  return jsonb_build_object('ok', true, 'lead_id', item.id, 'pipeline_id', target_pipe,
    'stage_id', target_stage, 'previous_member_id', member.id);
end;
$$;

revoke all on function public.reclaim_team_lead(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reclaim_team_lead(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
