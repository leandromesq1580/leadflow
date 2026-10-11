-- Campaign reporting + safe resend to unopened contacts. Builds on 062; never sends email.
-- Tracking is a per-campaign snapshot captured at scheduling. Older campaigns keep NULL and
-- can never infer "unread" retroactively.
BEGIN;
ALTER TABLE public.email_campaigns ADD COLUMN tracking_snapshot jsonb;
ALTER TABLE public.email_campaigns ADD COLUMN resend_of uuid REFERENCES public.email_campaigns(id);
-- One resend round per original campaign, enforced transactionally (any state, cancelled included:
-- a cancelled resend may already have delivered mail).
CREATE UNIQUE INDEX email_campaign_resend_once ON public.email_campaigns(resend_of) WHERE resend_of IS NOT NULL;
CREATE INDEX email_campaign_recipients_engagement ON public.email_campaign_recipients(campaign_id,delivered_at,opened_at,clicked_at);

-- Open tracking must have been confirmed when the original was scheduled.
CREATE FUNCTION public.ec_tracking_confirmed(p_snapshot jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT p_snapshot IS NOT NULL AND jsonb_typeof(p_snapshot->'open')='boolean' AND (p_snapshot->>'open')::boolean=true
$$;

-- Candidate rows for a resend: every recipient of the origin with a mutually exclusive exclusion reason.
CREATE FUNCTION public.ec_resend_rows(p_origin uuid)
RETURNS TABLE(recipient_id uuid,lead_id uuid,email text,name text,language text,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.lead_id,r.email,r.name,r.language,
  CASE WHEN r.clicked_at IS NOT NULL THEN 'clicked'
   WHEN r.opened_at IS NOT NULL THEN 'opened'
   WHEN r.state<>'delivered' OR r.delivered_at IS NULL THEN 'not_delivered'
   WHEN r.delivered_at>now()-interval '48 hours' THEN 'too_recent'
   WHEN c.email IS NULL OR c.suppressed_at IS NOT NULL OR c.consent_at IS NULL THEN 'blocked'
   WHEN NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=r.lead_id AND lower(btrim(l.email))=r.email) THEN 'lead_changed'
   ELSE NULL END
 FROM public.email_campaign_recipients r LEFT JOIN public.email_campaign_contacts c ON c.email=r.email
 WHERE r.campaign_id=p_origin
$$;

CREATE FUNCTION public.ec_resend_preview(p_actor uuid,p_origin uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.email_campaigns; existing uuid; blocked text; result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO o FROM public.email_campaigns WHERE id=p_origin;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 SELECT id INTO existing FROM public.email_campaigns WHERE resend_of=o.id;
 blocked:=CASE WHEN o.resend_of IS NOT NULL THEN 'resend_of_resend'
  WHEN NOT public.ec_tracking_confirmed(o.tracking_snapshot) THEN 'tracking_unconfirmed'
  WHEN o.state<>'completed' THEN 'origin_not_completed'
  WHEN existing IS NOT NULL THEN 'resend_exists' ELSE NULL END;
 -- The existing resend draft itself needs the live counts to be scheduled; any other block zeroes them.
 WITH a AS (SELECT * FROM public.ec_resend_rows(o.id))
 SELECT jsonb_build_object('origin_id',o.id,'origin_name',o.name,'allowed',blocked IS NULL,'reason',blocked,'existing_resend',existing,
  'total',count(*),'eligible',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL) ELSE 0 END,
  'pt',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL AND language='pt') ELSE 0 END,
  'es',CASE WHEN blocked IS NULL OR blocked='resend_exists' THEN count(*) FILTER(WHERE reason IS NULL AND language='es') ELSE 0 END,
  'exclusions',jsonb_build_object('clicked',count(*) FILTER(WHERE reason='clicked'),'opened',count(*) FILTER(WHERE reason='opened'),
   'not_delivered',count(*) FILTER(WHERE reason='not_delivered'),'too_recent',count(*) FILTER(WHERE reason='too_recent'),
   'blocked',count(*) FILTER(WHERE reason='blocked'),'lead_changed',count(*) FILTER(WHERE reason='lead_changed')))
 INTO result FROM a;
 RETURN result;
END $$;

-- Creates (once) a linked draft. Never schedules, never touches origin rows or events.
CREATE FUNCTION public.ec_resend_create(p_actor uuid,p_origin uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.email_campaigns; c public.email_campaigns; p jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO o FROM public.email_campaigns WHERE id=p_origin FOR UPDATE; -- serializes concurrent creation
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 SELECT * INTO c FROM public.email_campaigns WHERE resend_of=o.id;
 IF FOUND THEN RETURN jsonb_build_object('existing',true,'campaign',to_jsonb(c)); END IF;
 p:=public.ec_resend_preview(p_actor,o.id);
 IF (p->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p->>'reason'; END IF;
 IF (p->>'eligible')::int=0 THEN RAISE EXCEPTION 'empty_audience'; END IF;
 INSERT INTO public.email_campaigns(created_by,name,subject_pt,body_pt,subject_es,body_es,filters,resend_of)
 VALUES(p_actor,left('Reenvio · '||o.name,100),o.subject_pt,o.body_pt,o.subject_es,o.body_es,o.filters,o.id) RETURNING * INTO c;
 INSERT INTO public.email_campaign_audit(actor,campaign_id,action,details) VALUES(p_actor,c.id,'resend_prepared',jsonb_build_object('origin',o.id,'preview',p));
 RETURN jsonb_build_object('existing',false,'campaign',to_jsonb(c));
END $$;

DROP FUNCTION public.ec_schedule(uuid,uuid,timestamptz,jsonb,integer);
CREATE FUNCTION public.ec_schedule(p_actor uuid,p_id uuid,p_at timestamptz,p_forms jsonb,p_expected integer DEFAULT NULL,p_tracking jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns; a jsonb; n integer; p jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO c FROM public.email_campaigns WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 IF c.state<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
 IF p_at IS NULL OR p_at>now()+interval '366 days' THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 IF c.resend_of IS NULL THEN
  a:=public.ec_audience(p_actor,c.filters,p_forms);
  IF (a->>'eligible')::int=0 THEN RAISE EXCEPTION 'empty_audience'; END IF;
  INSERT INTO public.email_campaign_recipients(campaign_id,lead_id,email,name,language)
  SELECT c.id,lead_id,email,name,language FROM public.ec_rows(c.filters,p_forms) WHERE reason IS NULL;
 ELSE
  -- Resend: tracking must be confirmed now too, and the audience is the frozen origin list, never the generic filter.
  IF NOT public.ec_tracking_confirmed(p_tracking) THEN RAISE EXCEPTION 'tracking_unconfirmed'; END IF;
  PERFORM 1 FROM public.email_campaigns WHERE id=c.resend_of FOR SHARE;
  p:=public.ec_resend_preview(p_actor,c.resend_of);
  IF (p->>'reason') IS DISTINCT FROM 'resend_exists' AND (p->>'allowed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p->>'reason'; END IF;
  a:=jsonb_build_object('total_leads',p->'total','eligible',(SELECT count(*) FROM public.ec_resend_rows(c.resend_of) WHERE reason IS NULL),'pt',(SELECT count(*) FROM public.ec_resend_rows(c.resend_of) WHERE reason IS NULL AND language='pt'),'es',(SELECT count(*) FROM public.ec_resend_rows(c.resend_of) WHERE reason IS NULL AND language='es'),'exclusions',p->'exclusions','resend_of',c.resend_of);
  IF (a->>'eligible')::int=0 THEN RAISE EXCEPTION 'empty_audience'; END IF;
  INSERT INTO public.email_campaign_recipients(campaign_id,lead_id,email,name,language)
  SELECT c.id,lead_id,email,name,language FROM public.ec_resend_rows(c.resend_of) WHERE reason IS NULL;
 END IF;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>(a->>'eligible')::integer OR (p_expected IS NOT NULL AND n<>p_expected) THEN RAISE EXCEPTION 'audience_changed'; END IF;
 UPDATE public.email_campaigns SET state='scheduled',scheduled_at=greatest(p_at,now()),scheduled_by=p_actor,audience_snapshot=a,tracking_snapshot=p_tracking,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.email_campaign_audit(actor,campaign_id,action,details) VALUES(p_actor,c.id,'scheduled',jsonb_build_object('audience',a,'at',c.scheduled_at,'tracking',p_tracking,'resend_of',c.resend_of));
 RETURN to_jsonb(c);
END $$;

-- A pending resend row whose origin contact engaged meanwhile is removed from the queue.
CREATE FUNCTION public.ec_resend_engaged(p_campaign uuid,p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.email_campaigns c JOIN public.email_campaign_recipients o ON o.campaign_id=c.resend_of
  WHERE c.id=p_campaign AND o.email=p_email AND (o.opened_at IS NOT NULL OR o.clicked_at IS NOT NULL OR o.state<>'delivered'))
$$;

CREATE OR REPLACE FUNCTION public.ec_claim(p_daily integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns; r public.email_campaign_recipients; meter public.email_campaign_rate; t timestamptz:=clock_timestamp();
BEGIN
 IF p_daily<1 OR p_daily>10000 OR p_daily IS NULL THEN RAISE EXCEPTION 'invalid_daily_limit'; END IF;
 SELECT * INTO meter FROM public.email_campaign_rate WHERE id=true FOR UPDATE;
 t:=clock_timestamp();
 FOR c IN SELECT * FROM public.email_campaigns WHERE state IN ('scheduled','running','paused','cancelled') FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.email_campaign_recipients SET state='unknown',reason='worker_interrupted' WHERE campaign_id=c.id AND state='sending' AND lease_until<t;
  UPDATE public.email_campaign_recipients SET state=CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE campaign_id=c.id AND state='reserved' AND lease_until<t;
  UPDATE public.email_campaign_recipients r0 SET state='suppressed',reason='permission_or_suppression'
  WHERE r0.campaign_id=c.id AND r0.state='pending'
  AND EXISTS(SELECT 1 FROM public.email_campaign_contacts x WHERE x.email=r0.email AND (x.suppressed_at IS NOT NULL OR x.consent_at IS NULL));
  IF c.resend_of IS NOT NULL THEN
   UPDATE public.email_campaign_recipients r0 SET state='suppressed',reason='engaged_before_resend'
   WHERE r0.campaign_id=c.id AND r0.state='pending' AND public.ec_resend_engaged(c.id,r0.email);
  END IF;
  PERFORM public.ec_complete(c.id);
 END LOOP;
 IF meter.day IS DISTINCT FROM (t AT TIME ZONE 'UTC')::date THEN meter.day:=(t AT TIME ZONE 'UTC')::date;meter.day_used:=0; END IF;
 IF meter.minute IS DISTINCT FROM date_trunc('minute',t) THEN meter.minute:=date_trunc('minute',t);meter.minute_used:=0; END IF;
 IF meter.day_used>=p_daily OR meter.minute_used>=10 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.email_campaigns c0 WHERE state IN ('scheduled','running') AND scheduled_at<=t
 AND EXISTS(SELECT 1 FROM public.email_campaign_recipients x WHERE x.campaign_id=c0.id AND x.state='pending')
 ORDER BY scheduled_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.email_campaign_recipients WHERE campaign_id=c.id AND state='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.email_campaign_recipients SET state='reserved',lease=gen_random_uuid(),lease_until=t+interval '5 minutes' WHERE id=r.id RETURNING * INTO r;
 UPDATE public.email_campaign_rate SET day=meter.day,day_used=meter.day_used+1,minute=meter.minute,minute_used=meter.minute_used+1 WHERE id=true;
 UPDATE public.email_campaigns SET state='running',updated_at=t WHERE id=c.id;
 RETURN to_jsonb(r)||jsonb_build_object('campaign',to_jsonb(c));
END $$;

CREATE OR REPLACE FUNCTION public.ec_authorize(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_campaign_recipients; c public.email_campaigns; contact public.email_campaign_contacts;
BEGIN
 SELECT c0.* INTO c FROM public.email_campaigns c0 JOIN public.email_campaign_recipients r0 ON r0.campaign_id=c0.id WHERE r0.id=p_id FOR UPDATE OF c0;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.email_campaign_recipients WHERE id=p_id FOR UPDATE;
 IF r.lease IS DISTINCT FROM p_lease OR r.state<>'reserved' OR r.lease_until<clock_timestamp() THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=r.lead_id AND lower(btrim(l.email))=r.email) THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='lead_removed_or_email_changed' WHERE id=r.id;
  RETURN false;
 END IF;
 IF c.state NOT IN ('scheduled','running') THEN
  UPDATE public.email_campaign_recipients SET state=CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE id=r.id;
  RETURN false;
 END IF;
 -- Resend: the origin contact must still be unengaged immediately before sending.
 IF c.resend_of IS NOT NULL AND public.ec_resend_engaged(c.id,r.email) THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='engaged_before_resend' WHERE id=r.id;
  RETURN false;
 END IF;
 SELECT * INTO contact FROM public.email_campaign_contacts WHERE email=r.email FOR UPDATE;
 IF contact.suppressed_at IS NOT NULL OR contact.consent_at IS NULL THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='permission_or_suppression' WHERE id=r.id;
  RETURN false;
 END IF;
 UPDATE public.email_campaign_recipients SET state='sending',started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '5 minutes' WHERE id=r.id;
 RETURN true;
END $$;

-- Engagement filter applied in SQL before LIMIT, so the filtered total is exact.
CREATE FUNCTION public.ec_engagement_match(r public.email_campaign_recipients,p text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT p IS NULL
  OR (p='opened' AND r.opened_at IS NOT NULL) OR (p='clicked' AND r.clicked_at IS NOT NULL)
  OR (p='unopened' AND r.delivered_at IS NOT NULL AND r.opened_at IS NULL AND r.clicked_at IS NULL)
  OR (p='delivered' AND r.delivered_at IS NOT NULL) OR (p='accepted' AND r.state='accepted')
  OR (p='failed' AND r.state IN ('bounced','complained','refused')) OR (p='queue' AND r.state IN ('pending','reserved','sending'))
  OR (p='blocked' AND r.state IN ('suppressed','cancelled')) OR (p='unknown' AND r.state='unknown')
$$;

DROP FUNCTION public.ec_list(uuid,uuid,integer);
CREATE FUNCTION public.ec_list(p_actor uuid,p_id uuid DEFAULT NULL,p_page integer DEFAULT 0,p_engagement text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 IF p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'invalid_page'; END IF;
 IF p_engagement IS NOT NULL AND p_engagement NOT IN ('opened','clicked','unopened','delivered','accepted','failed','queue','blocked','unknown') THEN RAISE EXCEPTION 'invalid_engagement'; END IF;
 SELECT jsonb_build_object(
 'campaigns',coalesce((SELECT jsonb_agg(CASE WHEN p_id IS NULL THEN to_jsonb(x)-'body_pt'-'body_es' ELSE to_jsonb(x) END) FROM (
   SELECT c.*,(SELECT id FROM public.email_campaigns z WHERE z.resend_of=c.id) resend_id,(SELECT name FROM public.email_campaigns z WHERE z.id=c.resend_of) origin_name,
     jsonb_build_object('total',count(r.id),'pending',count(r.id) FILTER(WHERE r.state IN ('pending','reserved')),
     'sending',count(r.id) FILTER(WHERE r.state='sending'),'accepted',count(r.accepted_at),'delivered',count(r.delivered_at),
     'opened',count(r.opened_at),'clicked',count(r.clicked_at),'unopened',count(r.id) FILTER(WHERE r.delivered_at IS NOT NULL AND r.opened_at IS NULL AND r.clicked_at IS NULL),
     'bounced',count(r.id) FILTER(WHERE r.state='bounced'),
     'complained',count(r.id) FILTER(WHERE r.state='complained'),'refused',count(r.id) FILTER(WHERE r.state='refused'),
     'unknown',count(r.id) FILTER(WHERE r.state='unknown'),'suppressed',count(r.id) FILTER(WHERE r.state='suppressed'),
     'cancelled',count(r.id) FILTER(WHERE r.state='cancelled')) stats
   FROM public.email_campaigns c LEFT JOIN public.email_campaign_recipients r ON r.campaign_id=c.id
   WHERE p_id IS NULL OR c.id=p_id GROUP BY c.id ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET CASE WHEN p_id IS NULL THEN p_page*50 ELSE 0 END
 ) x),'[]'::jsonb),
 'total_campaigns',(SELECT count(*) FROM public.email_campaigns),
 'recipients',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT id,lead_id,name,email,language,state,reason,started_at,accepted_at,delivered_at,opened_at,clicked_at
   FROM public.email_campaign_recipients r WHERE r.campaign_id=p_id AND public.ec_engagement_match(r,p_engagement) ORDER BY id LIMIT 50 OFFSET p_page*50
 ) x),'[]'::jsonb),
 'total_recipients',(SELECT count(*) FROM public.email_campaign_recipients r WHERE r.campaign_id=p_id AND public.ec_engagement_match(r,p_engagement)),
 'engagement',p_engagement,
 'buyers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.buyers),'[]'::jsonb),
 'page',p_page) INTO result;
 RETURN result;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('ec_tracking_confirmed','ec_engagement_match','ec_resend_rows','ec_resend_preview','ec_resend_create','ec_resend_engaged','ec_schedule','ec_claim','ec_authorize','ec_list') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
