BEGIN;

CREATE TABLE public.wa_cloud_contacts (
 phone text PRIMARY KEY CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
 last_inbound_at timestamptz NOT NULL,
 subscribed boolean,
 consent_at timestamptz
);

CREATE TABLE public.wa_cloud_inbound_events (
 message_id text PRIMARY KEY,
 received_at timestamptz NOT NULL DEFAULT now()
);

-- Each mapping describes an approved, static Meta template and its actual body.
CREATE TABLE public.wa_cloud_templates (
 source_key text NOT NULL,
 locale text NOT NULL CHECK (locale IN ('pt','en','es')),
 template_name text NOT NULL CHECK (length(template_name) BETWEEN 1 AND 512 AND template_name ~ '^[a-z0-9_]+$'),
 template_language text NOT NULL CHECK (template_language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1024 AND position('{{' in body)=0),
 PRIMARY KEY (source_key,locale)
);

CREATE TABLE public.wa_cloud_dispatches (
 operation_id uuid PRIMARY KEY,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
 source_key text NOT NULL,
 message_id text UNIQUE,
 status text NOT NULL DEFAULT 'reserved'
  CHECK (status IN ('reserved','unknown','rejected','accepted','sent','failed','delivered','read')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wa_cloud_dispatches_created_at ON public.wa_cloud_dispatches(created_at);

CREATE INDEX wa_cloud_dispatches_reply_lookup ON public.wa_cloud_dispatches(phone,created_at DESC)
 WHERE message_id IS NOT NULL;

ALTER TABLE public.wa_cloud_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_cloud_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_cloud_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_cloud_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wa_cloud_contacts,public.wa_cloud_inbound_events,public.wa_cloud_templates,public.wa_cloud_dispatches
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wa_cloud_dispatches TO service_role;

CREATE FUNCTION public.wa_cloud_message_plan(p_phone text,p_lead_id uuid,p_buyer_id uuid,p_source_key text,p_locale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE contact public.wa_cloud_contacts; template public.wa_cloud_templates;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM leads l JOIN buyers b ON b.id=l.assigned_to
  WHERE l.id=p_lead_id AND b.id=p_buyer_id AND b.is_active
   AND l.redelivered_to_lead_id IS NULL AND l.assigned_to_member IS NULL AND NOT coalesce(l.archived,false)
   AND NOT coalesce(l.sms_opted_out,false)
   AND (regexp_replace(l.phone,'[^0-9]','','g') IN (p_phone, CASE WHEN p_phone ~ '^1[0-9]{10}$' THEN substr(p_phone,2) END))
   AND NOT EXISTS (SELECT 1 FROM ai_sequence_suppressions s WHERE s.lead_id=l.id AND s.reason='optout')
 ) THEN RETURN NULL; END IF;

 SELECT * INTO contact FROM wa_cloud_contacts WHERE phone=p_phone;
 IF NOT FOUND OR contact.subscribed IS DISTINCT FROM TRUE THEN RETURN NULL; END IF;

 SELECT * INTO template FROM wa_cloud_templates WHERE source_key=p_source_key AND locale=p_locale;
 IF FOUND THEN
  RETURN jsonb_build_object('name',template.template_name,'language',template.template_language,'body',template.body);
 END IF;
 -- Allow a small margin for the HTTP call to reach Meta before the window closes.
 IF contact.last_inbound_at>clock_timestamp()-interval '23 hours 59 minutes' THEN
  RETURN jsonb_build_object('name',NULL,'language',NULL,'body',NULL);
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.reserve_wa_cloud_dispatch(
 p_operation_id uuid,p_phone text,p_lead_id uuid,p_buyer_id uuid,p_source_key text,p_locale text,
 p_plan jsonb,p_body text,p_enrollment_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='1500ms' AS $$
BEGIN
 -- Inbound writes use the same contact-then-lead lock order.
 PERFORM 1 FROM wa_cloud_contacts WHERE phone=p_phone FOR SHARE;
 IF NOT FOUND OR p_plan IS NULL OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 4096
  OR (p_plan->>'body' IS NOT NULL AND p_body IS DISTINCT FROM p_plan->>'body')
  OR p_plan IS DISTINCT FROM wa_cloud_message_plan(p_phone,p_lead_id,p_buyer_id,p_source_key,p_locale)
 THEN RETURN false; END IF;

 -- Pacing belongs to the shared number, including different buyers and engines.
 PERFORM pg_advisory_xact_lock(hashtextextended('wa_cloud_company_sender_2126',0));
 IF (SELECT count(*) FROM wa_cloud_dispatches WHERE created_at>clock_timestamp()-interval '15 minutes')>=6
 THEN RETURN false; END IF;

 IF p_enrollment_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM sequence_enrollments WHERE id=p_enrollment_id
    AND lead_id=p_lead_id AND buyer_id=p_buyer_id AND lease_token=p_operation_id) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM wa_cloud_dispatches WHERE operation_id=p_operation_id) THEN RETURN false; END IF;
  IF (begin_sequence_batch(p_enrollment_id,p_operation_id,'17867442126',p_body)->>'allowed') IS DISTINCT FROM 'true'
  THEN RETURN false; END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM automation_runs r JOIN automations a ON a.id=r.automation_id
   WHERE r.id=p_operation_id AND r.lead_id=p_lead_id AND a.buyer_id=p_buyer_id
    AND a.enabled AND r.status='skipped') THEN RETURN false; END IF;
 END IF;

 INSERT INTO wa_cloud_dispatches(operation_id,lead_id,buyer_id,phone,source_key)
 VALUES(p_operation_id,p_lead_id,p_buyer_id,p_phone,p_source_key)
 ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.wa_cloud_inbox_status(p_status text) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_status IN ('failed','delivered','read') THEN p_status ELSE 'sent' END
$$;

CREATE FUNCTION public.wa_cloud_sync_inbox_insert() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE dispatch_status text;
BEGIN
 SELECT status INTO dispatch_status FROM wa_cloud_dispatches
  WHERE message_id=NEW.wa_message_id AND lead_id=NEW.lead_id AND buyer_id=NEW.buyer_id AND (phone=NEW.to_phone OR phone='1'||NEW.to_phone)
  FOR SHARE;
 IF FOUND THEN NEW.status:=wa_cloud_inbox_status(dispatch_status); END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER wa_cloud_sync_inbox_insert BEFORE INSERT ON public.whatsapp_messages
 FOR EACH ROW WHEN (NEW.direction='out' AND NEW.from_phone='17867442126' AND NEW.wa_message_id LIKE 'wamid.%')
 EXECUTE FUNCTION public.wa_cloud_sync_inbox_insert();

CREATE FUNCTION public.finish_wa_cloud_dispatch(p_operation_id uuid,p_message_id text,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_status NOT IN ('accepted','rejected','unknown') THEN RETURN false; END IF;
 IF p_status='accepted' THEN
  IF p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 7 AND 512 OR p_message_id !~ '^wamid\.[!-~]+$' THEN RETURN false; END IF;
  UPDATE wa_cloud_dispatches SET message_id=p_message_id,
   status=CASE WHEN status='reserved' THEN 'accepted' ELSE status END
   WHERE operation_id=p_operation_id AND (message_id IS NULL OR message_id=p_message_id);
 ELSE
  UPDATE wa_cloud_dispatches SET status=p_status WHERE operation_id=p_operation_id AND status='reserved';
 END IF;
 RETURN FOUND;
END $$;

-- A definitive Graph rejection may settle a still-live sequence reservation.
-- An expired or uncertain operation retains the original quarantine.
CREATE FUNCTION public.settle_wa_cloud_sequence_rejection(p_operation_id uuid,p_code integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='1500ms' AS $$
DECLARE e public.sequence_enrollments; d public.sequence_batch_dispatches; t timestamptz;
BEGIN
 SELECT * INTO e FROM sequence_enrollments WHERE lease_token=p_operation_id FOR UPDATE;
 IF NOT FOUND OR e.delivery_status<>'sending' THEN RETURN false; END IF;
 SELECT * INTO d FROM sequence_batch_dispatches
 WHERE token=p_operation_id AND enrollment_id=e.id AND cycle=e.enrolled_at AND step=e.current_step
  AND sender='17867442126' AND state='sending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM sequence_sender_batches WHERE sender=d.sender FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM wa_cloud_dispatches WHERE operation_id=p_operation_id AND lead_id=e.lead_id
  AND buyer_id=e.buyer_id AND status='rejected' AND message_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 t:=clock_timestamp();
 IF e.lease_until IS NULL OR e.lease_until<=t OR d.expires_at<=t THEN RETURN false; END IF;
 UPDATE sequence_batch_dispatches SET state='rejected_before_send',rejected_at=t,
  rejection_proof=jsonb_build_object('provider','whatsapp_cloud','operation_id',p_operation_id,'code',p_code)
 WHERE token=p_operation_id;
 UPDATE sequence_enrollments SET delivery_status='rejected_before_send',lease_token=NULL,lease_until=NULL,
  status=CASE WHEN status='active' THEN 'paused' ELSE status END,
  stop_reason=CASE WHEN status='active' THEN 'send_rejected_before_send' ELSE stop_reason END
 WHERE id=e.id;
 RETURN true;
END $$;

CREATE FUNCTION public.apply_wa_cloud_status(p_operation_id uuid,p_message_id text,p_status text,p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.wa_cloud_dispatches;
BEGIN
 IF p_status NOT IN ('sent','delivered','read','failed') OR p_message_id IS NULL
  OR length(p_message_id) NOT BETWEEN 7 AND 512 OR p_message_id !~ '^wamid\.[!-~]+$' THEN RETURN; END IF;
 UPDATE wa_cloud_dispatches SET message_id=p_message_id,
  status=CASE
   WHEN status='read' OR p_status='read' THEN 'read'
   WHEN status='delivered' OR p_status='delivered' THEN 'delivered'
   WHEN status='failed' OR p_status='failed' THEN 'failed'
   ELSE 'sent'
  END
  WHERE phone=p_phone AND (
   (p_operation_id IS NOT NULL AND operation_id=p_operation_id AND (message_id IS NULL OR message_id=p_message_id))
   OR (p_operation_id IS NULL AND message_id=p_message_id)
  )
 RETURNING * INTO d;
 IF FOUND THEN
  UPDATE whatsapp_messages SET status=wa_cloud_inbox_status(d.status)
  WHERE wa_message_id=d.message_id AND direction='out' AND from_phone='17867442126'
   AND (to_phone=d.phone OR '1'||to_phone=d.phone) AND buyer_id=d.buyer_id AND lead_id=d.lead_id;
 END IF;
END $$;

CREATE FUNCTION public.apply_wa_cloud_inbound(
 p_phone text,p_event_at timestamptz,p_message_id text,p_subscribed boolean,p_body text,p_reply_to text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='1500ms' AS $$
DECLARE reply record; contact public.wa_cloud_contacts;
BEGIN
 IF p_phone !~ '^[1-9][0-9]{7,14}$' OR p_event_at IS NULL OR p_event_at>clock_timestamp()+interval '1 minute'
  OR p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 7 AND 512 OR p_message_id !~ '^wamid\.[!-~]+$' THEN RETURN; END IF;
 INSERT INTO wa_cloud_inbound_events(message_id) VALUES(p_message_id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN; END IF;

 INSERT INTO wa_cloud_contacts(phone,last_inbound_at,subscribed,consent_at)
 VALUES(p_phone,least(p_event_at,clock_timestamp()),p_subscribed,CASE WHEN p_subscribed IS NOT NULL THEN p_event_at END)
 ON CONFLICT(phone) DO UPDATE SET
  last_inbound_at=greatest(wa_cloud_contacts.last_inbound_at,excluded.last_inbound_at),
  subscribed=CASE WHEN excluded.consent_at>wa_cloud_contacts.consent_at
   OR wa_cloud_contacts.consent_at IS NULL AND excluded.consent_at IS NOT NULL
   OR excluded.consent_at=wa_cloud_contacts.consent_at AND excluded.subscribed IS FALSE
   THEN excluded.subscribed ELSE wa_cloud_contacts.subscribed END,
  consent_at=greatest(wa_cloud_contacts.consent_at,excluded.consent_at)
 RETURNING * INTO contact;

 -- A quoted message identifies a conversation. Without one, only a unique
 -- current owner/lead pair from recent official sends is safe to attach.
 FOR reply IN
  SELECT d.lead_id,d.buyer_id,count(*) OVER () AS candidates
  FROM wa_cloud_dispatches d JOIN leads l ON l.id=d.lead_id AND l.assigned_to=d.buyer_id
  WHERE d.phone=p_phone AND d.message_id IS NOT NULL AND d.status NOT IN ('failed','rejected')
   AND l.redelivered_to_lead_id IS NULL AND l.assigned_to_member IS NULL
   AND (regexp_replace(l.phone,'[^0-9]','','g') IN (p_phone, CASE WHEN p_phone ~ '^1[0-9]{10}$' THEN substr(p_phone,2) END))
   AND d.created_at<=p_event_at+interval '1 second'
   AND (d.message_id=p_reply_to OR p_reply_to IS NULL AND d.created_at>=p_event_at-interval '30 days')
  GROUP BY d.lead_id,d.buyer_id
 LOOP
  IF reply.candidates<>1 THEN RETURN; END IF;
  IF p_subscribed IS FALSE AND contact.subscribed IS TRUE AND p_event_at<contact.consent_at THEN RETURN; END IF;
  INSERT INTO whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,wa_message_id,status,sent_at)
  VALUES(reply.buyer_id,reply.lead_id,'in',p_phone,'17867442126',
   CASE WHEN p_subscribed IS FALSE THEN 'STOP' ELSE left(coalesce(p_body,''),4096) END,
   p_message_id,'delivered',p_event_at)
  ON CONFLICT(wa_message_id) DO NOTHING;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION
 public.wa_cloud_message_plan(text,uuid,uuid,text,text),
 public.reserve_wa_cloud_dispatch(uuid,text,uuid,uuid,text,text,jsonb,text,uuid),
 public.finish_wa_cloud_dispatch(uuid,text,text),
 public.settle_wa_cloud_sequence_rejection(uuid,integer),
 public.apply_wa_cloud_status(uuid,text,text,text),
 public.apply_wa_cloud_inbound(text,timestamptz,text,boolean,text,text),
 public.wa_cloud_inbox_status(text),public.wa_cloud_sync_inbox_insert()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.wa_cloud_message_plan(text,uuid,uuid,text,text),
 public.reserve_wa_cloud_dispatch(uuid,text,uuid,uuid,text,text,jsonb,text,uuid),
 public.finish_wa_cloud_dispatch(uuid,text,text),
 public.settle_wa_cloud_sequence_rejection(uuid,integer),
 public.apply_wa_cloud_status(uuid,text,text,text),
 public.apply_wa_cloud_inbound(text,timestamptz,text,boolean,text,text)
 TO service_role;

COMMIT;
