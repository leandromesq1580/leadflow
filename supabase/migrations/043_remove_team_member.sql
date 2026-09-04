-- Remove a team membership atomically, without deleting leads or buyer accounts.
-- Active delegations reuse the tested reclaim transaction. Archived leads remain
-- archived; their history stays with the team owner and never re-enters routing.
create or replace function public.remove_team_member(
  p_member_id uuid,
  p_actor_buyer_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor public.buyers%rowtype;
  member public.team_members%rowtype;
  item public.leads%rowtype;
  result jsonb;
  returned_count integer := 0;
  archived_count integer := 0;
  lead_ids uuid[] := '{}';
begin
  select * into actor from public.buyers where id = p_actor_buyer_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  -- Blocks new FK assignments until removal commits. Concurrent repeated deletes
  -- wait, then return already_removed instead of duplicating any reclaim/audit.
  select * into member from public.team_members where id = p_member_id for update;
  if not found then return jsonb_build_object('ok', true, 'already_removed', true,
    'member_id', p_member_id, 'returned_leads', 0, 'archived_leads', 0); end if;
  if member.buyer_id <> actor.id and actor.is_admin is not true then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  for item in select * from public.leads where assigned_to_member = member.id order by id for update loop
    -- A corrupt cross-team reference must never transfer another buyer's lead.
    -- Raising rolls back earlier iterations as well (all-or-nothing removal).
    if item.assigned_to is distinct from member.buyer_id then
      raise exception using errcode = 'P0001', message = 'TEAM_REMOVAL_CONFLICT';
    end if;
    if item.archived is true then
      update public.leads set assigned_to_member = null where id = item.id;
      update public.whatsapp_messages set buyer_id = member.buyer_id
        where lead_id = item.id and buyer_id is distinct from member.buyer_id;
      delete from public.pipeline_leads pl using public.pipelines p
        where pl.pipeline_id = p.id and pl.lead_id = item.id and p.buyer_id <> member.buyer_id;
      update public.sequence_enrollments set status = 'stopped'
        where lead_id = item.id and buyer_id <> member.buyer_id and status = 'active';
      archived_count := archived_count + 1;
    else
      result := public.reclaim_team_lead(item.id, member.buyer_id, member.id);
      if result->>'ok' is distinct from 'true' then
        raise exception using errcode = 'P0001',
          message = 'TEAM_REMOVAL_' || coalesce(result->>'code', 'FAILED');
      end if;
    end if;
    lead_ids := array_append(lead_ids, item.id);
    returned_count := returned_count + 1;
  end loop;

  -- Private admin audit retains the removed membership for recovery/support.
  -- It is never read as an active membership or as an authentication grant.
  insert into public.settings(key, value, updated_at)
    values('team_member_removal:' || member.id, jsonb_build_object(
      'member', to_jsonb(member), 'actor_buyer_id', actor.id,
      'removed_at', now(), 'lead_ids', to_jsonb(lead_ids),
      'returned_leads', returned_count, 'archived_leads', archived_count), now());
  delete from public.team_members where id = member.id;
  return jsonb_build_object('ok', true, 'member_id', member.id,
    'returned_leads', returned_count, 'archived_leads', archived_count);
end;
$$;

revoke all on function public.remove_team_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
