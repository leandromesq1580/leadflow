-- Repair only: existing lead -> one silent card. Apply before publishing routes.
-- 056 already excludes sequence_reply_moved_at from stage_entered/stage_stale.
-- Reuse that silent-entry marker (and its ordinary-move reset), not enrollment APIs.
BEGIN;
COMMENT ON COLUMN public.pipeline_leads.sequence_reply_moved_at IS
 'Silent stage entry: sequence reply OR manual orphan repair. Suppress stage polling until a subsequent ordinary move.';
CREATE FUNCTION public.manual_lead_pipeline(p_auth uuid,p_lead uuid,p_pipeline uuid,p_stage uuid,p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
-- Bound EACH implicit lock wait too (audit, FKs, triggers, relation locks).
-- Function SET restores the caller's setting on success/error; unlike changing
-- statement_timeout inside an already running RPC, lock_timeout applies here.
SET lock_timeout='250ms' AS $$
DECLARE c public.pipeline_leads; actor public.buyers; member public.team_members; l public.leads; owner uuid; options jsonb;
BEGIN
 IF p_admin IS NULL OR (p_pipeline IS NULL) <> (p_stage IS NULL) THEN
  RAISE EXCEPTION 'invalid_target' USING ERRCODE='22023';
 END IF;
 -- Short, fail-fast global write fence: legacy writers do not take a per-lead lock.
 -- Blocks concurrent INSERT/UPDATE/DELETE, including the destructive 039 trigger.
 -- Explicit locks use NOWAIT; implicit waits are bounded by function lock_timeout.
 IF p_pipeline IS NOT NULL THEN LOCK TABLE public.pipeline_leads IN SHARE ROW EXCLUSIVE MODE NOWAIT; END IF;
 SELECT * INTO actor FROM buyers WHERE auth_user_id=p_auth FOR SHARE NOWAIT;
 IF actor.id IS NULL AND NOT p_admin THEN
  SELECT * INTO member FROM team_members WHERE auth_user_id=p_auth AND is_active
   ORDER BY id LIMIT 1 FOR SHARE NOWAIT;
  SELECT * INTO actor FROM buyers WHERE id=member.buyer_id FOR SHARE NOWAIT;
 END IF;
 IF actor.id IS NULL OR (actor.is_active IS FALSE AND actor.is_admin IS DISTINCT FROM true) OR (p_admin AND actor.is_admin IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 SELECT * INTO l FROM leads WHERE id=p_lead FOR UPDATE NOWAIT;
 IF l.id IS NULL OR l.archived THEN RAISE EXCEPTION 'lead_unavailable' USING ERRCODE='P0002'; END IF;
 -- Admin permission allows repairing for the owner, NEVER placing in another owner's pipeline.
 IF (NOT p_admin AND l.assigned_to IS DISTINCT FROM actor.id)
 OR (member.id IS NOT NULL AND l.assigned_to_member IS DISTINCT FROM member.id) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF p_pipeline IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stages',
   (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.position,s.id),'[]'::jsonb)
    FROM pipeline_stages s WHERE s.pipeline_id=p.id)) ORDER BY p.name,p.id),'[]'::jsonb)
  INTO options FROM pipelines p WHERE p.buyer_id=l.assigned_to;
  RETURN jsonb_build_object('eligible',NOT EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=p_lead),'pipelines',options);
 END IF;
 SELECT p.buyer_id INTO owner FROM pipelines p JOIN pipeline_stages s ON s.pipeline_id=p.id
 WHERE p.id=p_pipeline AND s.id=p_stage FOR SHARE OF p,s NOWAIT;
 IF owner IS NULL OR owner IS DISTINCT FROM l.assigned_to THEN RAISE EXCEPTION 'owner_or_stage_mismatch' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=p_lead) THEN
  SELECT * INTO c FROM pipeline_leads WHERE lead_id=p_lead AND pipeline_id=p_pipeline AND stage_id=p_stage;
  IF c.id IS NULL OR EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=p_lead AND id<>c.id) THEN
   RAISE EXCEPTION 'card_already_exists' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('changed',false,'entry',to_jsonb(c),'silent',true);
 END IF;
 -- The existing 052 AFTER INSERT trigger locks these enrollments. Preflight
 -- NOWAIT so an in-flight send holding enrollment -> lead cannot deadlock here.
 -- The locked lead also fences new enrollments via their FK/enrollment RPC.
 PERFORM 1 FROM sequence_enrollments WHERE lead_id=p_lead
  AND mode='ai_until_reply' AND status IN ('active','paused') ORDER BY id FOR UPDATE NOWAIT;
 INSERT INTO pipeline_leads(lead_id,pipeline_id,stage_id,position,moved_at,sequence_reply_moved_at)
 VALUES(p_lead,p_pipeline,p_stage,0,clock_timestamp(),clock_timestamp()) RETURNING * INTO c;
 -- Required audit: failure rolls back the card. Retry does not emit another add.
 INSERT INTO pipeline_moves(lead_id,pipeline_id,stage_id,action,via,actor_buyer_id,actor_auth_user_id,actor_member_id)
 VALUES(p_lead,p_pipeline,p_stage,'add','manual-silent-entry',actor.id,p_auth,member.id);
 RETURN jsonb_build_object('changed',true,'entry',to_jsonb(c),'silent',true);
END $$;
REVOKE ALL ON FUNCTION public.manual_lead_pipeline(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manual_lead_pipeline(uuid,uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
