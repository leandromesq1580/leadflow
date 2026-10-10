-- Admin-only insurance email campaigns. Separate from buyer sequences; does not change ownership.
-- This migration never grants consent to existing contacts and never sends email.
BEGIN;
CREATE TABLE public.email_campaign_contacts (
  email text PRIMARY KEY CHECK (email=lower(btrim(email))),
  consent_at timestamptz, consent_by uuid REFERENCES public.buyers(id) ON DELETE SET NULL, consent_evidence text,
  suppressed_at timestamptz, suppression_reason text,
  CHECK (consent_at IS NULL OR (consent_evidence IS NOT NULL AND length(consent_evidence)>=10))
);
CREATE TABLE public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  subject_pt text NOT NULL CHECK(length(subject_pt) BETWEEN 1 AND 160),
  body_pt text NOT NULL CHECK(length(body_pt) BETWEEN 1 AND 20000),
  subject_es text NOT NULL CHECK(length(subject_es) BETWEEN 1 AND 160),
  body_es text NOT NULL CHECK(length(body_es) BETWEEN 1 AND 20000),
  filters jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','scheduled','running','paused','cancelled','completed')),
  scheduled_at timestamptz, audience_snapshot jsonb, scheduled_by uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL, email text NOT NULL REFERENCES public.email_campaign_contacts(email),
  name text NOT NULL DEFAULT '', language text NOT NULL CHECK(language IN ('pt','es')),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','reserved','sending','accepted','delivered','bounced','complained','refused','unknown','suppressed','cancelled')),
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lease uuid, lease_until timestamptz, started_at timestamptz, accepted_at timestamptz,
  delivered_at timestamptz, opened_at timestamptz, clicked_at timestamptz,
  provider_id text UNIQUE, reason text,
  UNIQUE(campaign_id,email)
);
CREATE INDEX email_campaign_due ON public.email_campaigns(scheduled_at) WHERE state IN ('scheduled','running');
CREATE INDEX email_campaign_pending ON public.email_campaign_recipients(campaign_id,id) WHERE state='pending';
CREATE INDEX email_campaign_recipients_email ON public.email_campaign_recipients(email);
CREATE TABLE public.email_campaign_events (
  event_id text PRIMARY KEY, provider_id text NOT NULL, kind text NOT NULL,
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_campaign_event_provider ON public.email_campaign_events(provider_id);
CREATE TABLE public.email_campaign_rate (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), day date, day_used integer NOT NULL DEFAULT 0,
  minute timestamptz, minute_used integer NOT NULL DEFAULT 0
);
INSERT INTO public.email_campaign_rate(id) VALUES(true);
CREATE TABLE public.email_campaign_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid REFERENCES public.buyers(id) ON DELETE SET NULL, campaign_id uuid REFERENCES public.email_campaigns(id),
  action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- Browser clients, including admin browsers, cannot directly read/write contacts or tokens.
ALTER TABLE public.email_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaign_contacts, public.email_campaigns, public.email_campaign_recipients, public.email_campaign_events, public.email_campaign_rate, public.email_campaign_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_campaign_contacts, public.email_campaigns, public.email_campaign_recipients, public.email_campaign_events, public.email_campaign_rate, public.email_campaign_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.email_campaign_audit_id_seq TO service_role;

CREATE FUNCTION public.ec_admin(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.buyers WHERE id=p_actor AND is_admin=true) THEN RAISE EXCEPTION 'admin_required'; END IF;
END $$;

-- One row per selected lead, with a mutually exclusive exclusion reason.
-- Known form mapping is passed by trusted application code from META_FORM_LANGUAGES (parity tested).
CREATE FUNCTION public.ec_rows(p_filters jsonb,p_forms jsonb)
RETURNS TABLE(lead_id uuid,email text,name text,language text,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
  SELECT l.id,lower(btrim(l.email)) e,l.name,
    coalesce(p_forms->>l.form_name,l.lead_language) lang,l.created_at
  FROM public.leads l
  WHERE (coalesce(p_filters->>'buyer_id','')='' OR l.assigned_to=(p_filters->>'buyer_id')::uuid)
    AND (NOT p_filters ? 'states' OR jsonb_array_length(p_filters->'states')=0 OR l.state IN (SELECT jsonb_array_elements_text(p_filters->'states')))
    AND (NOT p_filters ? 'types' OR jsonb_array_length(p_filters->'types')=0 OR l.type IN (SELECT jsonb_array_elements_text(p_filters->'types')))
    AND (NOT p_filters ? 'languages' OR jsonb_array_length(p_filters->'languages')=0 OR coalesce(p_forms->>l.form_name,l.lead_language) IN (SELECT jsonb_array_elements_text(p_filters->'languages')))
    AND (coalesce(p_filters->>'since','')='' OR l.created_at >= (p_filters->>'since')::timestamptz)
    AND (coalesce(p_filters->>'until','')='' OR l.created_at < (p_filters->>'until')::timestamptz)
 ), ranked AS (
  SELECT *,row_number() OVER(PARTITION BY e ORDER BY created_at DESC,id) rn FROM candidates
 ), grouped AS (
  -- A filter cannot hide a conflicting language on another registration of this address.
  SELECT lower(btrim(x.email)) e,count(DISTINCT coalesce(p_forms->>x.form_name,x.lead_language)) languages,
    bool_or(coalesce(p_forms->>x.form_name,x.lead_language) IS NULL OR coalesce(p_forms->>x.form_name,x.lead_language) NOT IN ('pt','es')) bad_lang
  FROM public.leads x WHERE lower(btrim(x.email)) IN (SELECT e FROM candidates) GROUP BY lower(btrim(x.email))
 )
 SELECT r.id,r.e,coalesce(r.name,''),r.lang,
   CASE WHEN coalesce(r.e,'')='' THEN 'missing_email'
    WHEN r.e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' OR length(r.e)>254 THEN 'invalid_email'
    WHEN r.rn>1 THEN 'duplicate'
    WHEN g.languages<>1 OR g.bad_lang THEN 'language'
    WHEN c.suppressed_at IS NOT NULL THEN 'suppressed'
    WHEN c.consent_at IS NULL THEN 'permission'
    ELSE NULL END
 FROM ranked r LEFT JOIN grouped g ON g.e IS NOT DISTINCT FROM r.e
 LEFT JOIN public.email_campaign_contacts c ON c.email=r.e
$$;

CREATE FUNCTION public.ec_audience(p_actor uuid,p_filters jsonb,p_forms jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 WITH a AS (SELECT * FROM public.ec_rows(p_filters,p_forms))
 SELECT jsonb_build_object('total_leads',count(*),'eligible',count(*) FILTER(WHERE reason IS NULL),
  'pt',count(*) FILTER(WHERE reason IS NULL AND language='pt'),'es',count(*) FILTER(WHERE reason IS NULL AND language='es'),
  'exclusions',jsonb_build_object('missing_email',count(*) FILTER(WHERE reason='missing_email'),'invalid_email',count(*) FILTER(WHERE reason='invalid_email'),
    'duplicate',count(*) FILTER(WHERE reason='duplicate'),'language',count(*) FILTER(WHERE reason='language'),'suppressed',count(*) FILTER(WHERE reason='suppressed'),'permission',count(*) FILTER(WHERE reason='permission')))
 INTO result FROM a;
 RETURN result;
END $$;

CREATE FUNCTION public.ec_record_permission(p_actor uuid,p_filters jsonb,p_forms jsonb,p_evidence text,p_confirm boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 PERFORM public.ec_admin(p_actor);
 IF p_confirm IS DISTINCT FROM true OR length(btrim(p_evidence))<10 OR length(p_evidence)>2000 THEN RAISE EXCEPTION 'permission_attestation_required'; END IF;
 INSERT INTO public.email_campaign_contacts(email,consent_at,consent_by,consent_evidence)
 SELECT email,now(),p_actor,btrim(p_evidence) FROM public.ec_rows(p_filters,p_forms) WHERE reason='permission'
 ON CONFLICT(email) DO UPDATE SET consent_at=excluded.consent_at,consent_by=excluded.consent_by,consent_evidence=excluded.consent_evidence
 WHERE email_campaign_contacts.suppressed_at IS NULL AND email_campaign_contacts.consent_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.email_campaign_audit(actor,action,details) VALUES(p_actor,'permission_recorded',jsonb_build_object('count',n,'evidence',btrim(p_evidence),'filters',p_filters));
 RETURN n;
END $$;

CREATE FUNCTION public.ec_save(p_actor uuid,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns;
BEGIN
 PERFORM public.ec_admin(p_actor);
 IF p_id IS NOT NULL THEN
  SELECT * INTO c FROM public.email_campaigns WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF c.state<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
  UPDATE public.email_campaigns SET name=p_data->>'name',subject_pt=p_data->>'subject_pt',body_pt=p_data->>'body_pt',subject_es=p_data->>'subject_es',body_es=p_data->>'body_es',filters=coalesce(p_data->'filters','{}'),updated_at=now() WHERE id=p_id RETURNING * INTO c;
 ELSE
  INSERT INTO public.email_campaigns(created_by,name,subject_pt,body_pt,subject_es,body_es,filters)
  VALUES(p_actor,p_data->>'name',p_data->>'subject_pt',p_data->>'body_pt',p_data->>'subject_es',p_data->>'body_es',coalesce(p_data->'filters','{}')) RETURNING * INTO c;
 END IF;
 INSERT INTO public.email_campaign_audit(actor,campaign_id,action) VALUES(p_actor,c.id,'draft_saved');
 RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.ec_schedule(p_actor uuid,p_id uuid,p_at timestamptz,p_forms jsonb,p_expected integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns; a jsonb; n integer;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO c FROM public.email_campaigns WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 IF c.state<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
 IF p_at IS NULL OR p_at>now()+interval '366 days' THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 a:=public.ec_audience(p_actor,c.filters,p_forms);
 IF (a->>'eligible')::int=0 THEN RAISE EXCEPTION 'empty_audience'; END IF;
 INSERT INTO public.email_campaign_recipients(campaign_id,lead_id,email,name,language)
 SELECT c.id,lead_id,email,name,language FROM public.ec_rows(c.filters,p_forms) WHERE reason IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>(a->>'eligible')::integer OR (p_expected IS NOT NULL AND n<>p_expected) THEN RAISE EXCEPTION 'audience_changed'; END IF;
 UPDATE public.email_campaigns SET state='scheduled',scheduled_at=greatest(p_at,now()),scheduled_by=p_actor,audience_snapshot=a,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.email_campaign_audit(actor,campaign_id,action,details) VALUES(p_actor,c.id,'scheduled',jsonb_build_object('audience',a,'at',c.scheduled_at));
 RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.ec_control(p_actor uuid,p_id uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns;
BEGIN
 PERFORM public.ec_admin(p_actor);
 SELECT * INTO c FROM public.email_campaigns WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
 IF p_action='pause' AND c.state IN ('scheduled','running') THEN c.state:='paused';
 ELSIF p_action='resume' AND c.state='paused' THEN c.state:='scheduled';
 ELSIF p_action='cancel' AND c.state IN ('draft','scheduled','running','paused') THEN
  c.state:='cancelled';
  UPDATE public.email_campaign_recipients SET state='cancelled',reason='campaign_cancelled' WHERE campaign_id=c.id AND state IN ('pending','reserved');
 ELSE RAISE EXCEPTION 'invalid_transition'; END IF;
 UPDATE public.email_campaigns SET state=c.state,updated_at=now() WHERE id=c.id;
 INSERT INTO public.email_campaign_audit(actor,campaign_id,action) VALUES(p_actor,c.id,p_action);
 RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.ec_complete(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.email_campaigns SET state='completed',updated_at=now() WHERE id=p_id AND state IN ('scheduled','running')
 AND NOT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE campaign_id=p_id AND state IN ('pending','reserved','sending'))
$$;

-- Global row lock makes overlapping cron workers share capacity. Reservations consume quota conservatively.
-- A timed-out sending attempt is UNKNOWN, never automatically resent.
CREATE FUNCTION public.ec_claim(p_daily integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.email_campaigns; r public.email_campaign_recipients; meter public.email_campaign_rate; t timestamptz:=clock_timestamp();
BEGIN
 IF p_daily<1 OR p_daily>10000 OR p_daily IS NULL THEN RAISE EXCEPTION 'invalid_daily_limit'; END IF;
 SELECT * INTO meter FROM public.email_campaign_rate WHERE id=true FOR UPDATE;
 t:=clock_timestamp(); -- never account against a timestamp captured before waiting for the lock
 -- Reap only campaigns we can lock, in the same campaign -> recipient order as controls.
 FOR c IN SELECT * FROM public.email_campaigns WHERE state IN ('scheduled','running','paused','cancelled') FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.email_campaign_recipients SET state='unknown',reason='worker_interrupted' WHERE campaign_id=c.id AND state='sending' AND lease_until<t;
  UPDATE public.email_campaign_recipients SET state=CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END,lease=NULL,lease_until=NULL WHERE campaign_id=c.id AND state='reserved' AND lease_until<t;
  UPDATE public.email_campaign_recipients r0 SET state='suppressed',reason='permission_or_suppression'
  WHERE r0.campaign_id=c.id AND r0.state='pending'
  AND EXISTS(SELECT 1 FROM public.email_campaign_contacts x WHERE x.email=r0.email AND (x.suppressed_at IS NOT NULL OR x.consent_at IS NULL));
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

CREATE FUNCTION public.ec_authorize(p_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_campaign_recipients; c public.email_campaigns; contact public.email_campaign_contacts;
BEGIN
 -- Same locking order as pause/cancel: campaign, recipient, contact.
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
 SELECT * INTO contact FROM public.email_campaign_contacts WHERE email=r.email FOR UPDATE;
 IF contact.suppressed_at IS NOT NULL OR contact.consent_at IS NULL THEN
  UPDATE public.email_campaign_recipients SET state='suppressed',reason='permission_or_suppression' WHERE id=r.id;
  RETURN false;
 END IF;
 UPDATE public.email_campaign_recipients SET state='sending',started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '5 minutes' WHERE id=r.id;
 RETURN true;
END $$;

CREATE FUNCTION public.ec_unsubscribe(p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target text;
BEGIN
 SELECT email INTO target FROM public.email_campaign_recipients WHERE unsubscribe_token=p_token;
 IF target IS NULL THEN RETURN false; END IF;
 UPDATE public.email_campaign_contacts SET suppressed_at=coalesce(suppressed_at,now()),suppression_reason=coalesce(suppression_reason,'unsubscribe') WHERE email=target;
 -- Do not lock recipients while holding the contact lock. The worker sweeps blocked
 -- pending rows under campaign -> recipient locks, and authorize reconfirms suppression.
 RETURN true;
END $$;

CREATE FUNCTION public.ec_apply_events(p_provider text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_campaign_recipients; event_state text;
BEGIN
 SELECT * INTO r FROM public.email_campaign_recipients WHERE provider_id=p_provider FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT CASE kind WHEN 'email.complained' THEN 'complained' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.suppressed' THEN 'suppressed' WHEN 'email.failed' THEN 'refused' WHEN 'email.delivered' THEN 'delivered' END INTO event_state
 FROM public.email_campaign_events WHERE provider_id=p_provider AND kind IN ('email.complained','email.bounced','email.suppressed','email.failed','email.delivered')
 ORDER BY CASE kind WHEN 'email.complained' THEN 1 WHEN 'email.bounced' THEN 2 WHEN 'email.suppressed' THEN 3 WHEN 'email.failed' THEN 4 ELSE 5 END LIMIT 1;
 UPDATE public.email_campaign_recipients SET state=coalesce(event_state,state),
 delivered_at=(SELECT min(occurred_at) FROM public.email_campaign_events WHERE provider_id=p_provider AND kind='email.delivered'),
 opened_at=(SELECT min(occurred_at) FROM public.email_campaign_events WHERE provider_id=p_provider AND kind='email.opened'),
 clicked_at=(SELECT min(occurred_at) FROM public.email_campaign_events WHERE provider_id=p_provider AND kind='email.clicked') WHERE id=r.id;
 IF event_state IN ('bounced','complained','suppressed') THEN
  UPDATE public.email_campaign_contacts SET suppressed_at=coalesce(suppressed_at,now()),suppression_reason=coalesce(suppression_reason,event_state) WHERE email=r.email;
 END IF;
END $$;

CREATE FUNCTION public.ec_finish(p_id uuid,p_lease uuid,p_state text,p_provider text,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.email_campaign_recipients;
BEGIN
 IF p_state NOT IN ('accepted','refused','unknown') THEN RAISE EXCEPTION 'invalid_result'; END IF;
 IF p_state='accepted' AND coalesce(p_provider,'')='' THEN RAISE EXCEPTION 'provider_id_required'; END IF;
 PERFORM c.id FROM public.email_campaigns c JOIN public.email_campaign_recipients x ON x.campaign_id=c.id WHERE x.id=p_id FOR UPDATE OF c;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.email_campaign_recipients WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.lease IS DISTINCT FROM p_lease OR r.state NOT IN ('sending','unknown') THEN RETURN false; END IF;
 UPDATE public.email_campaign_recipients SET state=p_state,provider_id=p_provider,reason=left(p_reason,100),accepted_at=CASE WHEN p_state='accepted' THEN now() ELSE NULL END WHERE id=r.id;
 IF p_provider IS NOT NULL THEN PERFORM public.ec_apply_events(p_provider); END IF;
 PERFORM public.ec_complete(r.campaign_id);
 RETURN true;
END $$;

CREATE FUNCTION public.ec_event(p_event text,p_provider text,p_kind text,p_at timestamptz,p_recipient uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_kind NOT IN ('email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.failed','email.suppressed') THEN RETURN false; END IF;
 IF p_recipient IS NULL THEN SELECT id INTO p_recipient FROM public.email_campaign_recipients WHERE provider_id=p_provider; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.email_campaign_recipients WHERE id=p_recipient AND started_at IS NOT NULL AND (provider_id IS NULL OR provider_id=p_provider)) THEN RETURN false; END IF;
 INSERT INTO public.email_campaign_events(event_id,provider_id,kind,occurred_at) VALUES(p_event,p_provider,p_kind,p_at) ON CONFLICT DO NOTHING;
 PERFORM public.ec_apply_events(p_provider);
 RETURN true;
END $$;

CREATE FUNCTION public.ec_list(p_actor uuid,p_id uuid DEFAULT NULL,p_page integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.ec_admin(p_actor);
 IF p_page<0 OR p_page>100000 THEN RAISE EXCEPTION 'invalid_page'; END IF;
 SELECT jsonb_build_object(
 'campaigns',coalesce((SELECT jsonb_agg(CASE WHEN p_id IS NULL THEN to_jsonb(x)-'body_pt'-'body_es' ELSE to_jsonb(x) END) FROM (
   SELECT c.*,jsonb_build_object('total',count(r.id),'pending',count(r.id) FILTER(WHERE r.state IN ('pending','reserved')),
     'sending',count(r.id) FILTER(WHERE r.state='sending'),'accepted',count(r.accepted_at),'delivered',count(r.delivered_at),
     'opened',count(r.opened_at),'clicked',count(r.clicked_at),'bounced',count(r.id) FILTER(WHERE r.state='bounced'),
     'complained',count(r.id) FILTER(WHERE r.state='complained'),'refused',count(r.id) FILTER(WHERE r.state='refused'),
     'unknown',count(r.id) FILTER(WHERE r.state='unknown'),'suppressed',count(r.id) FILTER(WHERE r.state='suppressed'),
     'cancelled',count(r.id) FILTER(WHERE r.state='cancelled')) stats
   FROM public.email_campaigns c LEFT JOIN public.email_campaign_recipients r ON r.campaign_id=c.id
   WHERE p_id IS NULL OR c.id=p_id GROUP BY c.id ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET CASE WHEN p_id IS NULL THEN p_page*50 ELSE 0 END
 ) x),'[]'::jsonb),
 'total_campaigns',(SELECT count(*) FROM public.email_campaigns),
 'recipients',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT id,lead_id,name,email,language,state,reason,started_at,accepted_at,delivered_at,opened_at,clicked_at
   FROM public.email_campaign_recipients WHERE campaign_id=p_id ORDER BY id LIMIT 50 OFFSET p_page*50
 ) x),'[]'::jsonb),
 'total_recipients',(SELECT count(*) FROM public.email_campaign_recipients WHERE campaign_id=p_id),
 'buyers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.buyers),'[]'::jsonb),
 'page',p_page) INTO result;
 RETURN result;
END $$;

-- Default function execute grants are PUBLIC in Postgres: revoke every new helper/RPC explicitly.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('ec_admin','ec_rows','ec_audience','ec_record_permission','ec_save','ec_schedule','ec_control','ec_complete','ec_claim','ec_authorize','ec_unsubscribe','ec_apply_events','ec_finish','ec_event','ec_list') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
