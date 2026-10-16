BEGIN;

ALTER TABLE public.leads ADD COLUMN redelivery_source_id uuid REFERENCES public.leads(id);
ALTER TABLE public.leads ADD COLUMN redelivered_to_lead_id uuid REFERENCES public.leads(id) DEFERRABLE INITIALLY DEFERRED;
COMMENT ON COLUMN public.leads.redelivered_to_lead_id IS 'Terminal administrative source; excludes only redelivered originals from transport and inbound routing.';
COMMENT ON COLUMN public.leads.redelivery_source_id IS 'Administrative paid redelivery, not a new Meta capture. Original history remains on source.';
CREATE UNIQUE INDEX leads_redelivery_source_unique ON public.leads(redelivery_source_id) WHERE redelivery_source_id IS NOT NULL;

CREATE TABLE public.admin_new_lead_assignments (
  request_id uuid PRIMARY KEY,
  source_lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id),
  actor_auth_user_id uuid NOT NULL,
  actor_buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  source_buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  credit_id uuid NOT NULL REFERENCES public.credits(id),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id),
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id),
  language text NOT NULL,
  remaining bigint NOT NULL,
  assigned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.admin_new_lead_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_new_lead_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.admin_new_lead_assignments TO service_role;
CREATE TRIGGER admin_new_lead_assignment_immutable BEFORE UPDATE OR DELETE ON public.admin_new_lead_assignments
 FOR EACH ROW EXECUTE FUNCTION public.block_evidence_mutation();

CREATE TABLE public.admin_new_lead_assignment_requests (
 request_id uuid PRIMARY KEY, original_request_id uuid NOT NULL REFERENCES public.admin_new_lead_assignments(request_id),
 actor_auth_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.admin_new_lead_assignment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_new_lead_assignment_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.admin_new_lead_assignment_requests TO service_role;
CREATE TRIGGER admin_new_lead_request_immutable BEFORE UPDATE OR DELETE ON public.admin_new_lead_assignment_requests FOR EACH ROW EXECUTE FUNCTION public.block_evidence_mutation();

CREATE TABLE public.admin_new_lead_effects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.admin_new_lead_assignments(request_id),
 kind text NOT NULL CHECK(kind IN ('notification','automation','enrollment')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','unknown','cancelled')),
 token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 UNIQUE(request_id,kind)
);
ALTER TABLE public.admin_new_lead_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_new_lead_effects FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.admin_new_lead_effects TO service_role;
CREATE INDEX admin_new_lead_effects_pending ON public.admin_new_lead_effects(kind,available_at) WHERE state IN ('pending','processing');

CREATE FUNCTION public.admin_new_lead_source_error(p_source uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.leads;
BEGIN
 SELECT * INTO l FROM leads WHERE id=p_source;
 IF l.id IS NULL THEN RETURN 'source_not_found'; END IF;
 IF l.archived OR l.redelivered_to_lead_id IS NOT NULL OR l.contract_closed OR l.status IN ('sold','closed','converted') OR EXISTS(
  SELECT 1 FROM pipeline_leads pl JOIN pipeline_stages s ON s.id=pl.stage_id WHERE pl.lead_id=l.id AND ai_sequence_won(s.name)
 ) THEN RETURN 'source_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE id=l.assigned_to AND is_admin=true) THEN RETURN 'source_not_admin'; END IF;
 IF l.sms_opted_out OR EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE lead_id=l.id AND NOT(reason='delivery_unknown' AND resolved_at IS NOT NULL))
  OR EXISTS(SELECT 1 FROM email_campaign_contacts WHERE lower(email)=lower(l.email) AND suppressed_at IS NOT NULL)
 THEN RETURN 'contact_blocked'; END IF;
 IF l.lead_language IS NULL OR l.lead_language NOT IN ('pt','es') THEN RETURN 'unsupported_language'; END IF;
 IF EXISTS(SELECT 1 FROM sequence_enrollments WHERE lead_id=l.id AND delivery_status IN ('sending','unknown'))
 OR EXISTS(SELECT 1 FROM automation_runs WHERE lead_id=l.id AND status IN ('skipped','failed'))
 OR EXISTS(SELECT 1 FROM sms_messages WHERE lead_id=l.id AND direction='out' AND status IN ('sending','queued','unknown')) THEN RETURN 'source_busy'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.admin_new_lead_source_error(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_new_lead_source_error(uuid) TO service_role;

-- One immutable family key serializes assignment, inbound, enrollment and send
-- admission BEFORE any row lock. Ancestors remain private conversation owners.
CREATE FUNCTION public.admin_new_lead_family(p_lead uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE ancestors AS (
  SELECT id,redelivery_source_id FROM leads WHERE id=p_lead
  UNION
  SELECT l.id,l.redelivery_source_id FROM leads l JOIN ancestors a ON l.id=a.redelivery_source_id
 ) SELECT hashtextextended(coalesce((SELECT id::text FROM ancestors WHERE redelivery_source_id IS NULL),p_lead::text),71002)
$$;
REVOKE ALL ON FUNCTION public.admin_new_lead_family(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_assign_lead_as_new(p_actor uuid,p_source uuid,p_buyer uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE l public.leads; a public.buyers; receipt public.admin_new_lead_assignments; credit uuid; balance bigint; pipe uuid; stage uuid; target uuid:=gen_random_uuid(); t timestamptz; why text;
BEGIN
 IF p_actor IS NULL OR p_source IS NULL OR p_buyer IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(admin_new_lead_family(p_source));
 -- Buyer-before-lead matches enroll_sequence/suspension. Ordered SHARE locks
 -- protect authorization and target activity without incompatible FK upgrades.
 PERFORM 1 FROM buyers WHERE auth_user_id=p_actor OR id=p_buyer OR id=(SELECT assigned_to FROM leads WHERE id=p_source) ORDER BY id FOR SHARE;
 SELECT * INTO a FROM buyers WHERE auth_user_id=p_actor AND is_admin=true;
 IF a.id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 -- Request lock first; same source with different keys is serialized by its row.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,71001));
 SELECT receipt_row.* INTO receipt FROM admin_new_lead_assignment_requests q JOIN admin_new_lead_assignments receipt_row ON receipt_row.request_id=q.original_request_id WHERE q.request_id=p_request;
 IF FOUND AND (receipt.source_lead_id<>p_source OR receipt.buyer_id<>p_buyer) THEN RAISE EXCEPTION 'request_conflict'; END IF;
 SELECT * INTO l FROM leads WHERE id=p_source FOR NO KEY UPDATE;
 SELECT * INTO receipt FROM admin_new_lead_assignments WHERE source_lead_id=p_source;
 IF FOUND THEN
  IF receipt.buyer_id<>p_buyer THEN RAISE EXCEPTION 'source_already_delivered'; END IF;
  INSERT INTO admin_new_lead_assignment_requests(request_id,original_request_id,actor_auth_user_id) VALUES(p_request,receipt.request_id,p_actor) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success',true,'lead_id',receipt.lead_id,'source_lead_id',receipt.source_lead_id,'buyer_id',receipt.buyer_id,'assigned_at',receipt.assigned_at,'remaining',receipt.remaining,'replayed',true);
 END IF;
 -- Fail fast against reverse-order sequence finish/STOP; never wait while a
 -- transport reservation is in flight. No enrollment is moved or cleared.
 PERFORM 1 FROM sequence_enrollments WHERE lead_id=p_source ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM ai_sequence_suppressions WHERE lead_id=p_source ORDER BY buyer_id FOR UPDATE NOWAIT;
 -- Fence phantom stage closures and suppression rows from legacy writers,
 -- not just rows visible in this snapshot. Same short timeout as row locks.
 LOCK TABLE pipeline_leads IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE pipelines,pipeline_stages,ai_sequence_suppressions,email_campaign_contacts IN SHARE MODE;
 why:=admin_new_lead_source_error(p_source);
 IF why IS NOT NULL THEN RAISE EXCEPTION '%',why; END IF;
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE id=p_buyer AND is_active=true) THEN RAISE EXCEPTION 'buyer_unavailable'; END IF;
 -- Fences prevent phantom default pipelines/credit debts from legacy direct
 -- writers. Bounded 500ms acquisition; short transaction, no external IO.
 LOCK TABLE credits IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE pipelines,pipeline_stages IN SHARE MODE;
 PERFORM 1 FROM credits WHERE buyer_id=p_buyer AND type='lead' AND lead_language=l.lead_language ORDER BY id FOR UPDATE;
 SELECT coalesce(sum(CASE WHEN total_purchased-total_used<0 OR expires_at IS NULL OR expires_at>clock_timestamp() THEN total_purchased-total_used ELSE 0 END),0)
 INTO balance FROM credits WHERE buyer_id=p_buyer AND type='lead' AND lead_language=l.lead_language;
 SELECT id INTO credit FROM credits WHERE buyer_id=p_buyer AND type='lead' AND lead_language=l.lead_language AND total_purchased>total_used AND (expires_at IS NULL OR expires_at>clock_timestamp()) ORDER BY purchased_at,id LIMIT 1;
 IF balance<=0 OR credit IS NULL THEN RAISE EXCEPTION 'no_credit'; END IF;
 IF (SELECT count(*) FROM pipelines WHERE buyer_id=p_buyer AND is_default=true)<>1 THEN RAISE EXCEPTION 'pipeline_unavailable'; END IF;
 SELECT id INTO pipe FROM pipelines WHERE buyer_id=p_buyer AND is_default=true;
 SELECT id INTO stage FROM pipeline_stages WHERE pipeline_id=pipe ORDER BY position,id LIMIT 1;
 IF stage IS NULL THEN RAISE EXCEPTION 'pipeline_unavailable'; END IF;
 t:=clock_timestamp();
 UPDATE credits SET total_used=total_used+1 WHERE id=credit;
 UPDATE leads SET archived=true,archived_at=t,archived_by=a.id,redelivered_to_lead_id=target,updated_at=t WHERE id=p_source;
 -- Existing archive trigger stops active/paused legacy AND AI enrollments.
 -- Explicit stop is defense in depth and preserves all rows and receipts.
 UPDATE sequence_enrollments SET status='stopped',stop_reason='archived',completed_at=t WHERE lead_id=p_source AND status IN ('active','paused');
 UPDATE sms_messages SET status='canceled',error='source_redelivered' WHERE lead_id=p_source AND direction='out' AND status='scheduled';
 INSERT INTO leads(id,name,email,phone,city,state,interest,age_range,reason,birth_date,lead_language,assigned_to,assigned_at,created_at,updated_at,type,status,product_type,delivery_credit_id,redelivery_source_id)
 VALUES(target,l.name,l.email,l.phone,l.city,l.state,l.interest,l.age_range,l.reason,l.birth_date,l.lead_language,p_buyer,t,t,t,'hot','assigned','lead',credit,p_source);
 INSERT INTO pipeline_leads(lead_id,pipeline_id,stage_id,position,moved_at) VALUES(target,pipe,stage,0,t);
 INSERT INTO admin_new_lead_assignments(request_id,source_lead_id,lead_id,actor_auth_user_id,actor_buyer_id,source_buyer_id,buyer_id,credit_id,pipeline_id,stage_id,language,remaining,assigned_at)
 VALUES(p_request,p_source,target,p_actor,a.id,l.assigned_to,p_buyer,credit,pipe,stage,l.lead_language,balance-1,t);
 INSERT INTO admin_new_lead_assignment_requests(request_id,original_request_id,actor_auth_user_id) VALUES(p_request,p_request,p_actor);
 INSERT INTO admin_new_lead_effects(request_id,kind) SELECT p_request,k FROM unnest(ARRAY['notification','automation','enrollment']) k;
 RETURN jsonb_build_object('success',true,'lead_id',target,'source_lead_id',p_source,'buyer_id',p_buyer,'assigned_at',t,'remaining',balance-1,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_assign_lead_as_new(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_lead_as_new(uuid,uuid,uuid,uuid) TO service_role;
CREATE FUNCTION public.admin_new_lead_assignment_options(p_actor uuid,p_source uuid,p_query text DEFAULT '',p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE l public.leads; why text; result jsonb; page_size integer:=least(greatest(coalesce(p_limit,50),1),100);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE auth_user_id=p_actor AND is_admin=true) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 why:=admin_new_lead_source_error(p_source);
 IF why IS NOT NULL THEN RAISE EXCEPTION '%',why; END IF;
 SELECT * INTO l FROM leads WHERE id=p_source;
 WITH candidates AS (
  SELECT b.id,b.name,b.email,b.is_active,
   coalesce((SELECT sum(CASE WHEN total_purchased-total_used<0 OR expires_at IS NULL OR expires_at>now() THEN total_purchased-total_used ELSE 0 END) FROM credits WHERE buyer_id=b.id AND type='lead' AND lead_language=l.lead_language),0)::bigint remaining,
   (SELECT count(*)=1 FROM pipelines WHERE buyer_id=b.id AND is_default=true) AND EXISTS(SELECT 1 FROM pipelines p JOIN pipeline_stages s ON s.pipeline_id=p.id WHERE p.buyer_id=b.id AND p.is_default=true) pipeline_ok
  FROM buyers b WHERE (p_cursor IS NULL OR b.id>p_cursor)
   AND (coalesce(p_query,'')='' OR strpos(lower(coalesce(b.name,'')),lower(left(p_query,100)))>0 OR strpos(lower(coalesce(b.email,'')),lower(left(p_query,100)))>0)
  ORDER BY b.id LIMIT page_size+1
 ), page AS (
  SELECT *,CASE WHEN is_active IS DISTINCT FROM true THEN 'buyer_unavailable' WHEN NOT pipeline_ok THEN 'pipeline_unavailable' WHEN remaining<=0 THEN 'no_credit' ELSE NULL END reason FROM candidates ORDER BY id LIMIT page_size
 ) SELECT jsonb_build_object('lead',jsonb_build_object('id',l.id,'name',l.name,'language',l.lead_language),
 'buyers',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'name',name,'email',email,'remaining',remaining,'eligible',reason IS NULL,'reason',reason)) ORDER BY id) FROM page),'[]'::jsonb),
 'next_cursor',CASE WHEN (SELECT count(*) FROM candidates)>page_size THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_new_lead_assignment_options(uuid,uuid,text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_new_lead_assignment_options(uuid,uuid,text,uuid,integer) TO service_role;
CREATE FUNCTION public.admin_new_lead_assignment_status(p_actor uuid,p_source uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.admin_new_lead_assignments;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE auth_user_id=p_actor AND is_admin=true) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM admin_new_lead_assignment_requests q JOIN admin_new_lead_assignments a ON a.request_id=q.original_request_id WHERE q.request_id=p_request AND a.source_lead_id<>p_source) THEN RAISE EXCEPTION 'request_conflict'; END IF;
 SELECT * INTO r FROM admin_new_lead_assignments WHERE source_lead_id=p_source;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Exact read-back, not just the RPC's claimed success. Receipts are append-only.
 IF NOT EXISTS(SELECT 1 FROM leads l JOIN leads s ON s.id=r.source_lead_id WHERE l.id=r.lead_id AND l.redelivery_source_id=s.id AND l.assigned_to=r.buyer_id AND l.delivery_credit_id=r.credit_id AND l.assigned_at=r.assigned_at AND l.created_at=r.assigned_at AND s.archived=true)
 OR NOT EXISTS(SELECT 1 FROM lead_delivery_receipts WHERE lead_id=r.lead_id AND buyer_id=r.buyer_id AND credit_id=r.credit_id AND delivered_at=r.assigned_at) THEN RAISE EXCEPTION 'readback_failed'; END IF;
 RETURN jsonb_build_object('success',true,'lead_id',r.lead_id,'source_lead_id',r.source_lead_id,'buyer_id',r.buyer_id,'assigned_at',r.assigned_at,'remaining',r.remaining,'replayed',true,
 'notifications_pending',EXISTS(SELECT 1 FROM admin_new_lead_effects WHERE request_id=r.request_id AND kind='notification' AND state NOT IN ('done','cancelled')));
END $$;

CREATE FUNCTION public.claim_admin_new_lead_effect(p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE e public.admin_new_lead_effects; r public.admin_new_lead_assignments;
BEGIN
 -- Notification transports lack end-to-end idempotency. A timed-out send is
 -- quarantined, never blindly retried (may have reached one of several channels).
 UPDATE admin_new_lead_effects SET state='unknown' WHERE kind='notification' AND state='processing' AND lease_until<clock_timestamp();
 SELECT * INTO e FROM admin_new_lead_effects WHERE kind=p_kind AND (state='pending' AND available_at<=clock_timestamp() OR kind<>'notification' AND state='processing' AND lease_until<clock_timestamp()) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM admin_new_lead_assignments WHERE request_id=e.request_id;
 IF NOT EXISTS(SELECT 1 FROM leads l JOIN buyers b ON b.id=l.assigned_to WHERE l.id=r.lead_id AND l.assigned_to=r.buyer_id AND b.is_active=true AND l.archived IS NOT TRUE AND l.contract_closed IS NOT TRUE AND l.sms_opted_out IS NOT TRUE)
 OR EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE lead_id=r.lead_id AND NOT(reason='delivery_unknown' AND resolved_at IS NOT NULL)) THEN
  UPDATE admin_new_lead_effects SET state='cancelled',finished_at=clock_timestamp() WHERE id=e.id;
  RETURN NULL;
 END IF;
 UPDATE admin_new_lead_effects SET state='processing',token=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes',attempts=attempts+1 WHERE id=e.id RETURNING * INTO e;
 RETURN to_jsonb(e)||jsonb_build_object('lead_id',r.lead_id,'buyer_id',r.buyer_id,'stage_id',r.stage_id);
END $$;

CREATE FUNCTION public.finish_admin_new_lead_effect(p_id uuid,p_token uuid,p_state text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_state NOT IN ('done','pending','unknown','cancelled') THEN RAISE EXCEPTION 'invalid_state'; END IF;
 UPDATE admin_new_lead_effects SET state=p_state,finished_at=CASE WHEN p_state IN ('done','cancelled') THEN clock_timestamp() END,available_at=clock_timestamp()+interval '1 minute'
 WHERE id=p_id AND token=p_token AND state='processing' AND lease_until>clock_timestamp() AND NOT(kind='notification' AND p_state='pending');
 RETURN FOUND;
END $$;

CREATE FUNCTION public.enroll_admin_new_lead_sequence(p_effect uuid,p_token uuid,p_sequence uuid,p_due timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE e public.admin_new_lead_effects; r public.admin_new_lead_assignments; s public.sequences;
BEGIN
 SELECT a.* INTO r FROM admin_new_lead_effects f JOIN admin_new_lead_assignments a ON a.request_id=f.request_id WHERE f.id=p_effect;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(admin_new_lead_family(r.lead_id));
 SELECT * INTO e FROM admin_new_lead_effects WHERE id=p_effect AND token=p_token AND kind='enrollment' AND state='processing' AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM admin_new_lead_assignments WHERE request_id=e.request_id;
 PERFORM 1 FROM buyers WHERE id=r.buyer_id FOR SHARE;
 PERFORM 1 FROM leads WHERE id=r.lead_id FOR NO KEY UPDATE;
 SELECT * INTO s FROM sequences WHERE id=p_sequence AND buyer_id=r.buyer_id AND trigger_stage_id=r.stage_id AND enabled=true FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Existing means done, including stopped/completed/paused. Never reactivate.
 IF EXISTS(SELECT 1 FROM sequence_enrollments WHERE sequence_id=s.id AND lead_id=r.lead_id) THEN RETURN true; END IF;
 IF ai_sequence_block(r.buyer_id,r.lead_id,s.id,r.assigned_at) IS NOT NULL OR NOT EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=r.lead_id AND stage_id=r.stage_id) THEN RETURN false; END IF;
 INSERT INTO sequence_enrollments(sequence_id,lead_id,buyer_id,mode,current_step,next_run_at,status)
 VALUES(s.id,r.lead_id,r.buyer_id,s.mode,0,greatest(p_due,clock_timestamp()),'active') ON CONFLICT(sequence_id,lead_id) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_new_lead_assignment_status(uuid,uuid,uuid),public.claim_admin_new_lead_effect(text),public.finish_admin_new_lead_effect(uuid,uuid,text),public.enroll_admin_new_lead_sequence(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_new_lead_assignment_status(uuid,uuid,uuid),public.claim_admin_new_lead_effect(text),public.finish_admin_new_lead_effect(uuid,uuid,text),public.enroll_admin_new_lead_sequence(uuid,uuid,uuid,timestamptz) TO service_role;
CREATE FUNCTION public.block_redelivered_source_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE target uuid;
BEGIN
 IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(admin_new_lead_family(NEW.lead_id));
 -- The reservation and assignment use the same source row lock. A reservation
 -- committed first is visible to source_busy; assignment first rejects the run.
 SELECT redelivered_to_lead_id INTO target FROM leads WHERE id=NEW.lead_id FOR NO KEY UPDATE;
 IF target IS NOT NULL THEN RAISE EXCEPTION 'source_redelivered'; END IF;
 IF EXISTS(SELECT 1 FROM admin_new_lead_assignments WHERE lead_id=NEW.lead_id)
 AND (EXISTS(SELECT 1 FROM leads WHERE id=NEW.lead_id AND sms_opted_out)
  OR EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE lead_id=NEW.lead_id AND reason='optout')) THEN
  RAISE EXCEPTION 'contact_blocked';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_redelivered_source_work() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER no_redelivered_automation BEFORE INSERT ON public.automation_runs
 FOR EACH ROW EXECUTE FUNCTION public.block_redelivered_source_work();
CREATE TRIGGER no_redelivered_sms BEFORE INSERT OR UPDATE OF status ON public.sms_messages
 FOR EACH ROW WHEN (NEW.direction='out' AND NEW.status IN ('scheduled','sending','queued')) EXECUTE FUNCTION public.block_redelivered_source_work();
CREATE FUNCTION public.protect_admin_redelivery_links() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.redelivery_source_id IS NOT NULL AND NEW.redelivery_source_id IS DISTINCT FROM OLD.redelivery_source_id
   OR OLD.redelivered_to_lead_id IS NOT NULL AND (NEW.redelivered_to_lead_id IS DISTINCT FROM OLD.redelivered_to_lead_id OR NEW.archived IS DISTINCT FROM true OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  THEN RAISE EXCEPTION 'redelivery_immutable'; END IF;
 END IF;
 IF current_user NOT IN ('service_role',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.leads'::regclass)) THEN
  IF TG_OP='INSERT' AND (NEW.redelivery_source_id IS NOT NULL OR NEW.redelivered_to_lead_id IS NOT NULL)
   OR TG_OP='UPDATE' AND (NEW.redelivery_source_id IS DISTINCT FROM OLD.redelivery_source_id OR NEW.redelivered_to_lead_id IS DISTINCT FROM OLD.redelivered_to_lead_id)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_admin_redelivery_links() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_admin_redelivery_links BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.protect_admin_redelivery_links();
-- Preserve the existing policies verbatim for unrelated leads. For a paid cycle,
-- every caller (claim, begin, manual enrollment and recheck) uses the immutable
-- receipt boundary, even when an enrollment is created after the reply.
ALTER FUNCTION public.ai_sequence_block(uuid,uuid,uuid,timestamptz) RENAME TO ai_sequence_block_before_admin_redelivery;
REVOKE ALL ON FUNCTION public.ai_sequence_block_before_admin_redelivery(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ai_sequence_block(p_buyer uuid,p_lead uuid,p_sequence uuid,p_since timestamptz DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE boundary timestamptz;
BEGIN
 SELECT assigned_at INTO boundary FROM admin_new_lead_assignments WHERE lead_id=p_lead;
 RETURN ai_sequence_block_before_admin_redelivery(p_buyer,p_lead,p_sequence,coalesce(boundary,p_since));
END $$;
REVOKE ALL ON FUNCTION public.ai_sequence_block(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_sequence_block(uuid,uuid,uuid,timestamptz) TO service_role;

-- Acquire before the old AFTER trigger's lead/enrollment locks, including leads
-- that have not been redelivered YET. Thus INSERT first and assignment first both
-- see the other's committed decision. Timeout aborts the whole INSERT for retry.
CREATE FUNCTION public.fence_admin_new_lead_inbound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Transaction-local also bounds the established AFTER trigger's row locks.
 -- The webhook must retry the entire INSERT on a timeout, not drop the event.
 PERFORM set_config('lock_timeout','500ms',true);
 PERFORM pg_advisory_xact_lock(admin_new_lead_family(NEW.lead_id));
 RETURN NEW;
END $$;
CREATE TRIGGER admin_new_lead_inbound_fence BEFORE INSERT ON public.sms_messages
 FOR EACH ROW WHEN (NEW.direction='in' AND NEW.lead_id IS NOT NULL) EXECUTE FUNCTION public.fence_admin_new_lead_inbound();
CREATE TRIGGER admin_new_lead_inbound_fence BEFORE INSERT ON public.whatsapp_messages
 FOR EACH ROW WHEN (NEW.direction='in' AND NEW.lead_id IS NOT NULL) EXECUTE FUNCTION public.fence_admin_new_lead_inbound();

-- Only consent metadata follows the immutable chain, NEVER message text, owner,
-- lead_id or event timestamp. STOP is timeless; ordinary reply applies only to
-- receipts already issued at the message's original event time.
CREATE FUNCTION public.propagate_admin_new_lead_inbound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE l public.leads; target uuid:=NEW.lead_id; event_at timestamptz; reason text; boundary timestamptz;
BEGIN
 SELECT * INTO l FROM leads WHERE id=target;
 IF l.redelivery_source_id IS NULL AND l.redelivered_to_lead_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='whatsapp_messages' THEN
  IF NEW.buyer_id IS DISTINCT FROM l.assigned_to THEN RETURN NEW; END IF;
  event_at:=NEW.sent_at;
 ELSE event_at:=NEW.created_at; END IF;
 reason:=CASE WHEN lower(trim(coalesce(NEW.body,''))) ~ '^(stop|stopall|cancel|end|quit|parar|pare|sair|cancelar|unsubscribe|baja|no me contacte)[.! ]*$' THEN 'optout' ELSE 'replied' END;
 WHILE target IS NOT NULL LOOP
  SELECT * INTO l FROM leads WHERE id=target FOR NO KEY UPDATE;
  EXIT WHEN NOT FOUND;
  SELECT assigned_at INTO boundary FROM admin_new_lead_assignments WHERE lead_id=target;
  IF l.assigned_to IS NOT NULL AND (reason='optout' OR event_at>=boundary) THEN
   PERFORM 1 FROM sequence_enrollments WHERE lead_id=target ORDER BY id FOR UPDATE;
   INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(l.assigned_to,target,reason)
   ON CONFLICT(buyer_id,lead_id) DO UPDATE SET reason=CASE WHEN ai_sequence_suppressions.reason='optout' THEN 'optout' ELSE excluded.reason END;
   UPDATE sequence_enrollments SET status='stopped',stop_reason=reason,completed_at=clock_timestamp()
    WHERE lead_id=target AND buyer_id=l.assigned_to AND mode IN ('legacy','ai_until_reply') AND status IN ('active','paused');
   IF reason='optout' AND l.sms_opted_out IS DISTINCT FROM true THEN
    UPDATE leads SET sms_opted_out=true WHERE id=target;
   END IF;
  END IF;
  target:=l.redelivered_to_lead_id;
 END LOOP;
 RETURN NEW;
END $$;
-- Run AFTER the established reply-stage trigger so its existing intent survives.
CREATE TRIGGER zz_admin_new_lead_inbound AFTER INSERT ON public.sms_messages
 FOR EACH ROW WHEN (NEW.direction='in' AND NEW.lead_id IS NOT NULL) EXECUTE FUNCTION public.propagate_admin_new_lead_inbound();
CREATE TRIGGER zz_admin_new_lead_inbound AFTER INSERT ON public.whatsapp_messages
 FOR EACH ROW WHEN (NEW.direction='in' AND NEW.lead_id IS NOT NULL) EXECUTE FUNCTION public.propagate_admin_new_lead_inbound();
REVOKE ALL ON FUNCTION public.fence_admin_new_lead_inbound(),public.propagate_admin_new_lead_inbound() FROM PUBLIC,anon,authenticated,service_role;

-- Do not wait for inbound while holding an enrollment. No transport permission
-- may escape while that contact's inbound/assignment transaction is undecided.
-- Old functions are private implementations, not alternative service RPCs.
ALTER FUNCTION public.begin_sequence_batch(uuid,uuid,text,text) RENAME TO begin_sequence_batch_before_admin_redelivery;
REVOKE ALL ON FUNCTION public.begin_sequence_batch_before_admin_redelivery(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.begin_sequence_batch(p_id uuid,p_token uuid,p_sender text,p_body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 SELECT l.id INTO target FROM sequence_enrollments e JOIN leads l ON l.id=e.lead_id WHERE e.id=p_id
  AND (l.redelivery_source_id IS NOT NULL OR l.redelivered_to_lead_id IS NOT NULL);
 IF target IS NOT NULL AND NOT pg_try_advisory_xact_lock(admin_new_lead_family(target)) THEN
  RETURN jsonb_build_object('allowed',false);
 END IF;
 RETURN begin_sequence_batch_before_admin_redelivery(p_id,p_token,p_sender,p_body);
END $$;
ALTER FUNCTION public.begin_ai_send(uuid,uuid,text) RENAME TO begin_ai_send_before_admin_redelivery;
REVOKE ALL ON FUNCTION public.begin_ai_send_before_admin_redelivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.begin_ai_send(p_id uuid,p_token uuid,p_body text) RETURNS SETOF public.sequence_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 SELECT l.id INTO target FROM sequence_enrollments e JOIN leads l ON l.id=e.lead_id WHERE e.id=p_id
  AND (l.redelivery_source_id IS NOT NULL OR l.redelivered_to_lead_id IS NOT NULL);
 IF target IS NOT NULL AND NOT pg_try_advisory_xact_lock(admin_new_lead_family(target)) THEN RETURN; END IF;
 RETURN QUERY SELECT * FROM begin_ai_send_before_admin_redelivery(p_id,p_token,p_body);
END $$;
REVOKE ALL ON FUNCTION public.begin_sequence_batch(uuid,uuid,text,text),public.begin_ai_send(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_sequence_batch(uuid,uuid,text,text),public.begin_ai_send(uuid,uuid,text) TO service_role;
COMMIT;
