-- Additive rollout: install before web. Old RPCs remain available; no activation/backfill.
BEGIN;
CREATE TABLE public.sequence_sender_batches (
 sender text PRIMARY KEY CHECK(sender ~ '^[1-9][0-9]{7,14}$'),
 used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 10),
 last_reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cooldown_until timestamptz
);
CREATE TABLE public.sequence_batch_dispatches (
 enrollment_id uuid NOT NULL, cycle timestamptz NOT NULL, step integer NOT NULL,
 token uuid UNIQUE NOT NULL, sender text REFERENCES public.sequence_sender_batches(sender),
 state text NOT NULL CHECK(state IN ('sending','sent','unknown')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '2 minutes'),
 PRIMARY KEY(enrollment_id,cycle,step)
);
CREATE INDEX sequence_batch_inflight_sender ON public.sequence_batch_dispatches(sender) WHERE state='sending';
ALTER TABLE public.sequence_sender_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_batch_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sequence_sender_batches,public.sequence_batch_dispatches FROM anon,authenticated;
GRANT ALL ON public.sequence_sender_batches,public.sequence_batch_dispatches TO service_role;

-- Lock order: callers may hold their own enrollment, then ledger, then sender.
-- Cleanup NEVER locks/updates an enrollment or suppression (including STOP/deleted).
-- SKIP LOCKED avoids waiting on a finish/defer holding a ledger lock; its sending
-- row still prevents reset. Finish locks ledger before reading state: cleanup first
-- means late confirmation is rejected; finish first means cleanup skips/rechecks it.
-- This is a database admission deadline, NOT cancellation of a bridge request and
-- NOT physical spacing or exactly-once delivery. Unknown is never auto-retried.
CREATE FUNCTION public.expire_sequence_batch_dispatches(p_sender text) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 WITH expired AS (
  SELECT token FROM public.sequence_batch_dispatches
  WHERE sender=p_sender AND state='sending' AND expires_at<=clock_timestamp()
  ORDER BY token FOR UPDATE SKIP LOCKED
 )
 UPDATE public.sequence_batch_dispatches d SET state='unknown'
 FROM expired x WHERE d.token=x.token AND d.state='sending';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN
  UPDATE public.sequence_sender_batches
  SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '5 minutes')
  WHERE sender=p_sender;
 END IF;
 RETURN n;
END $$;

-- Walk real UTC minutes (including DST folds/gaps), matching the application window.
CREATE FUNCTION public.sequence_batch_next_window(p_id uuid,p_after timestamptz) RETURNS timestamptz
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c jsonb; t timestamptz:=p_after; wall timestamp; i integer;
BEGIN
 SELECT s.ai_config INTO c FROM public.sequences s JOIN public.sequence_enrollments e ON e.sequence_id=s.id WHERE e.id=p_id AND e.mode='ai_until_reply';
 IF NOT FOUND THEN RETURN t; END IF;
 IF c->>'timezone' IS NULL OR c->>'start' IS NULL OR c->>'end' IS NULL OR jsonb_array_length(c->'days')=0 THEN RAISE EXCEPTION 'invalid_window'; END IF;
 FOR i IN 0..11520 LOOP
  wall:=t AT TIME ZONE (c->>'timezone');
  IF c->'days' @> to_jsonb(extract(dow FROM wall)::integer) AND to_char(wall,'HH24:MI')>=c->>'start' AND to_char(wall,'HH24:MI')<c->>'end' THEN RETURN t; END IF;
  t:=date_trunc('minute',t)+interval '1 minute';
 END LOOP;
 RAISE EXCEPTION 'invalid_window';
END $$;

-- Waiting is not a failed generation/tentative. Preserve all cancellation states.
CREATE FUNCTION public.wait_sequence_batch(p_id uuid,p_token uuid,p_next timestamptz,p_reason text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.sequence_enrollments SET next_run_at=public.sequence_batch_next_window(p_id,p_next),
 lease_token=NULL,lease_until=NULL,attempts=greatest(0,attempts-1),generation_status='idle',stop_reason=p_reason
 WHERE id=p_id AND lease_token=p_token AND status='active' AND delivery_status='idle';
END $$;

CREATE FUNCTION public.claim_legacy_sequence(p_id uuid) RETURNS SETOF public.sequence_enrollments
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; reason text;
BEGIN
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id AND mode='legacy' AND status='active' AND next_run_at<=clock_timestamp() FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR e.lease_until>clock_timestamp() THEN RETURN; END IF;
 IF e.delivery_status IN ('sending','unknown') THEN
  INSERT INTO public.ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(e.buyer_id,e.lead_id,'delivery_unknown') ON CONFLICT DO NOTHING;
  UPDATE public.sequence_batch_dispatches SET state='unknown' WHERE token=e.lease_token AND state='sending';
  UPDATE public.sequence_enrollments SET status='paused',stop_reason='delivery_unknown',delivery_status='unknown' WHERE id=p_id; RETURN;
 END IF;
 reason:=public.ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id,e.enrolled_at);
 IF reason IS NOT NULL THEN UPDATE public.sequence_enrollments SET status='stopped',stop_reason=reason,completed_at=clock_timestamp() WHERE id=p_id; RETURN; END IF;
 IF e.attempts>=3 THEN UPDATE public.sequence_enrollments SET status='paused',stop_reason='retry_exhausted' WHERE id=p_id; RETURN; END IF;
 RETURN QUERY UPDATE public.sequence_enrollments SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,delivery_status='idle' WHERE id=p_id RETURNING *;
END $$;

-- This is the only NEW transport permission. Enrollment lock precedes suppression
-- inspection and sender lock. Different buyers/URLs share one canonical sender row.
CREATE FUNCTION public.begin_sequence_batch(p_id uuid,p_token uuid,p_sender text,p_body text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; b public.sequence_sender_batches; why text; t timestamptz; due timestamptz; st public.sequence_steps; channel text;
BEGIN
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id AND status='active' AND lease_token=p_token AND lease_until>clock_timestamp() AND delivery_status='idle' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false); END IF;
 why:=public.ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id,e.enrolled_at);
 IF why IS NOT NULL THEN UPDATE public.sequence_enrollments SET status='stopped',stop_reason=why,completed_at=clock_timestamp() WHERE id=p_id; RETURN jsonb_build_object('allowed',false); END IF;
 IF p_sender IS NULL THEN
  SELECT * INTO st FROM public.sequence_steps WHERE sequence_id=e.sequence_id ORDER BY step_order OFFSET e.current_step LIMIT 1;
  IF st.template_id IS NOT NULL THEN SELECT type INTO channel FROM public.templates WHERE id=st.template_id; END IF;
  IF e.mode='ai_until_reply' OR (st.step_type='send_template' AND coalesce(channel,'whatsapp')<>'email') THEN
   PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '5 minutes','sender_unavailable');
   RETURN jsonb_build_object('allowed',false);
  END IF;
 END IF;
 t:=clock_timestamp(); due:=public.sequence_batch_next_window(p_id,t);
 IF due>t THEN PERFORM public.wait_sequence_batch(p_id,p_token,due,'outside_window'); RETURN jsonb_build_object('allowed',false,'next',due); END IF;
 IF p_sender IS NOT NULL THEN
  IF p_sender !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'invalid_sender'; END IF;
  PERFORM public.expire_sequence_batch_dispatches(p_sender);
  INSERT INTO public.sequence_sender_batches(sender) VALUES(p_sender) ON CONFLICT DO NOTHING;
  SELECT * INTO b FROM public.sequence_sender_batches WHERE sender=p_sender FOR UPDATE;
  t:=clock_timestamp();
  IF (b.cooldown_until IS NULL OR b.cooldown_until<=t) AND (b.cooldown_until IS NOT NULL AND b.cooldown_until<=t OR b.used<10 AND b.last_reserved_at<=t-interval '5 minutes')
   AND NOT EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='sending') THEN
   b.used:=0; b.cooldown_until:=NULL;
  END IF;
  IF b.used>=10 OR b.cooldown_until>t THEN
   due:=greatest(coalesce(b.cooldown_until,t+interval '5 minutes'),t+interval '1 second');
   PERFORM public.wait_sequence_batch(p_id,p_token,due,'batch_wait');
   RETURN jsonb_build_object('allowed',false,'next',due);
  END IF;
 END IF;
 -- Sender lock acquisition may have waited across a lease/window boundary.
 t:=clock_timestamp(); due:=public.sequence_batch_next_window(p_id,t);
 IF e.lease_until<=t OR due>t THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,greatest(due,t+interval '1 second'),'outside_window');
  RETURN jsonb_build_object('allowed',false);
 END IF;
 -- One token/cycle/step may receive permission exactly once, not exactly-once delivery.
 INSERT INTO public.sequence_batch_dispatches(enrollment_id,cycle,step,token,sender,state,expires_at) VALUES(e.id,e.enrolled_at,e.current_step,p_token,p_sender,'sending',t+interval '2 minutes') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false); END IF;
 IF p_sender IS NOT NULL THEN
  UPDATE public.sequence_sender_batches SET used=b.used+1,last_reserved_at=t,
   cooldown_until=CASE WHEN b.used+1=10 THEN t+interval '5 minutes' ELSE b.cooldown_until END WHERE sender=p_sender;
 END IF;
 UPDATE public.sequence_enrollments SET generated_body=p_body,generation_status='ready',delivery_status='sending',send_started_at=t,lease_until=t+interval '2 minutes' WHERE id=p_id;
 RETURN jsonb_build_object('allowed',true);
END $$;

CREATE FUNCTION public.finish_sequence_batch(p_id uuid,p_token uuid,p_wa text,p_choice text,p_next timestamptz,p_from text,p_to text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; d public.sequence_batch_dispatches; n integer; delay integer;
BEGIN
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id FOR UPDATE;
 SELECT * INTO d FROM public.sequence_batch_dispatches WHERE token=p_token AND enrollment_id=p_id FOR UPDATE;
 IF d.state='sent' THEN RETURN true; END IF;
 IF e.id IS NULL OR e.lease_token IS DISTINCT FROM p_token OR e.delivery_status<>'sending' OR d.state IS DISTINCT FROM 'sending' OR e.enrolled_at<>d.cycle OR d.expires_at<=clock_timestamp() THEN RETURN false; END IF;
 IF d.sender IS NOT NULL AND coalesce(p_wa,'')='' THEN RAISE EXCEPTION 'missing_delivery_confirmation'; END IF;
 IF e.mode='ai_until_reply' THEN
  IF NOT public.finish_ai_send(p_id,p_token,p_wa,p_choice,p_next,p_from,p_to) THEN RETURN false; END IF;
 ELSE
  IF d.sender IS NOT NULL THEN
   INSERT INTO public.whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,wa_message_id,status)
   VALUES(e.buyer_id,e.lead_id,'out',p_from,p_to,e.generated_body,p_wa,'sent') ON CONFLICT(wa_message_id) DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM public.whatsapp_messages WHERE wa_message_id=p_wa AND buyer_id=e.buyer_id AND lead_id=e.lead_id AND direction='out' AND body=e.generated_body AND sent_at>=e.send_started_at) THEN RAISE EXCEPTION 'delivery_confirmation_mismatch'; END IF;
  END IF;
  SELECT count(*) INTO n FROM public.sequence_steps WHERE sequence_id=e.sequence_id;
  SELECT delay_hours INTO delay FROM public.sequence_steps WHERE sequence_id=e.sequence_id ORDER BY step_order OFFSET (e.current_step+1) LIMIT 1;
  UPDATE public.sequence_enrollments SET current_step=current_step+1,
   status=CASE WHEN status='active' AND current_step+1>=n THEN 'completed' ELSE status END,
   completed_at=CASE WHEN status='active' AND current_step+1>=n THEN clock_timestamp() ELSE completed_at END,
   next_run_at=e.next_run_at+coalesce(delay,0)*interval '1 hour',last_sent_at=clock_timestamp(),
   delivery_status='sent',attempts=0,lease_token=NULL,lease_until=NULL WHERE id=p_id;
 END IF;
 UPDATE public.sequence_batch_dispatches SET state='sent' WHERE token=p_token;
 -- Cooldown never starts before the final in-flight member of a full batch finishes.
 UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '5 minutes') WHERE sender=d.sender AND used=10;
 RETURN true;
END $$;
CREATE FUNCTION public.defer_sequence_batch(p_id uuid,p_token uuid,p_reason text,p_next timestamptz,p_unknown boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; d public.sequence_batch_dispatches;
BEGIN
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id AND lease_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 -- Enrollment lock excludes begin/finish for this token. Cleanup can only turn
 -- sending into unknown, so this read needs no ledger lock before suppression.
 SELECT * INTO d FROM public.sequence_batch_dispatches WHERE token=p_token AND enrollment_id=p_id;
 -- The HTTP response may have been lost after admission committed. Client-side
 -- sending=false is not evidence that permission was never granted.
 p_unknown:=coalesce(p_unknown,false) OR e.delivery_status IN ('sending','unknown') OR coalesce(d.state IN ('sending','unknown'),false);
 IF p_unknown THEN p_reason:='delivery_unknown'; END IF;
 -- Match claim: enrollment -> suppression -> ledger -> sender. The underlying
 -- defer obtains suppression before its enrollment update fires quarantine.
 PERFORM public.defer_ai_sequence(p_id,p_token,p_reason,p_next,p_unknown);
 IF p_unknown THEN
  UPDATE public.sequence_batch_dispatches SET state='unknown' WHERE token=p_token AND state='sending';
  UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '5 minutes') WHERE used=10 AND sender=(SELECT sender FROM public.sequence_batch_dispatches WHERE token=p_token);
 END IF;
END $$;
-- Advisory preflight avoids provider work during a known cooldown. Begin still
-- repeats every check and reserves atomically; this grants no transport permission.
CREATE FUNCTION public.preflight_sequence_batch(p_id uuid,p_token uuid,p_sender text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.sequence_sender_batches; t timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM public.sequence_enrollments WHERE id=p_id AND status='active' AND lease_token=p_token AND lease_until>t AND delivery_status='idle' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_sender IS NULL OR p_sender !~ '^[1-9][0-9]{7,14}$' THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,t+interval '5 minutes','sender_unavailable'); RETURN false;
 END IF;
 PERFORM public.expire_sequence_batch_dispatches(p_sender);
 t:=clock_timestamp();
 SELECT * INTO b FROM public.sequence_sender_batches WHERE sender=p_sender;
 IF b.cooldown_until>t OR (b.used>=10 AND EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='sending')) THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,greatest(b.cooldown_until,t+interval '1 second'),'batch_wait'); RETURN false;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.sequence_batch_quarantine() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.delivery_status='unknown' AND OLD.delivery_status='sending' THEN
  UPDATE public.sequence_batch_dispatches SET state='unknown' WHERE token=OLD.lease_token AND state='sending';
  UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '5 minutes')
   WHERE used=10 AND sender=(SELECT sender FROM public.sequence_batch_dispatches WHERE token=OLD.lease_token);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sequence_batch_unknown AFTER UPDATE OF delivery_status ON public.sequence_enrollments FOR EACH ROW EXECUTE FUNCTION public.sequence_batch_quarantine();
-- Extend the existing cancellation triggers to legacy, using the same stable
-- enrollment-before-suppression order. Do not acquire lead locks in begin/finish;
-- outbound FK KEY SHARE remains compatible with inbound NO KEY UPDATE.
CREATE OR REPLACE FUNCTION public.stop_ai_sequence_on_inbound() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner uuid; reason text; event_at timestamptz;
BEGIN
 IF NEW.direction<>'in' OR NEW.lead_id IS NULL THEN RETURN NEW; END IF;
 -- Same lock as enroll_sequence: after waiting, inspect the committed enrollment.
 -- NO KEY UPDATE serializes enrollment/ownership changes but stays compatible
 -- with outbound FK KEY SHARE during finish (which already owns enrollment).
 -- FOR UPDATE here creates a lead/enrollment deadlock and can abort inbound.
 PERFORM 1 FROM leads WHERE id=NEW.lead_id FOR NO KEY UPDATE;
 IF TG_TABLE_NAME='whatsapp_messages' THEN owner:=NEW.buyer_id; event_at:=NEW.sent_at;
 ELSE SELECT assigned_to INTO owner FROM leads WHERE id=NEW.lead_id; event_at:=NEW.created_at; END IF;
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM leads WHERE id=NEW.lead_id AND assigned_to=owner) THEN RETURN NEW; END IF;
 -- Match claim/manual stop/delete: enrollment locks precede suppression locks.
 -- Lock in stable order, including stopped rows whose in-flight send may finish.
 PERFORM 1 FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy')
  AND buyer_id=owner AND lead_id=NEW.lead_id ORDER BY id FOR UPDATE;
 reason:=CASE WHEN lower(trim(coalesce(NEW.body,''))) ~ '^(stop|parar|pare|sair|cancelar|unsubscribe|baja|no me contacte)[.! ]*$' THEN 'optout' ELSE 'replied' END;
 IF reason='replied' AND NOT EXISTS(SELECT 1 FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy') AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND event_at>=enrolled_at) THEN RETURN NEW; END IF;
 INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(owner,NEW.lead_id,reason)
 ON CONFLICT(buyer_id,lead_id) DO UPDATE SET reason=CASE WHEN ai_sequence_suppressions.reason='optout' THEN 'optout' ELSE excluded.reason END;
 UPDATE sequence_enrollments SET status='stopped',stop_reason=reason,completed_at=now()
 WHERE mode IN ('ai_until_reply','legacy') AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND (reason='optout' OR event_at>=enrolled_at);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.recheck_ai_sequences() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; why text; target uuid;
BEGIN
 IF TG_TABLE_NAME='pipeline_leads' THEN target:=CASE WHEN TG_OP='DELETE' THEN OLD.lead_id ELSE NEW.lead_id END;
 ELSE target:=NEW.id; END IF;
 IF TG_TABLE_NAME='leads' THEN
  IF NEW.sms_opted_out=true AND NEW.assigned_to IS NOT NULL THEN
   -- Include stopped enrollments: a manual stop may still be committing its
   -- suppression, and opt-out must win without aborting the lead update.
   PERFORM 1 FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy')
    AND lead_id=NEW.id ORDER BY id FOR UPDATE;
   INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(NEW.assigned_to,NEW.id,'optout')
   ON CONFLICT(buyer_id,lead_id) DO UPDATE SET reason='optout';
  END IF;
 END IF;
 FOR e IN SELECT * FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy') AND status IN ('active','paused') AND
  CASE TG_TABLE_NAME WHEN 'leads' THEN lead_id=target WHEN 'pipeline_leads' THEN lead_id=target
   WHEN 'buyers' THEN buyer_id=target WHEN 'sequences' THEN sequence_id=target ELSE false END
 ORDER BY id FOR UPDATE LOOP
  why:=ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id,e.enrolled_at);
  IF why IS NOT NULL THEN
   UPDATE sequence_enrollments SET status=CASE WHEN why='sold' THEN 'completed' ELSE 'stopped' END,stop_reason=why,completed_at=now() WHERE id=e.id;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.preserve_ai_delivery_on_delete() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- A sequence/enrollment deletion must retain the quarantine. A parent deletion
 -- has already removed the lead/buyer in this transaction; do not recreate an
 -- orphan suppression from the cascade (its foreign keys must remain valid).
 IF OLD.mode IN ('ai_until_reply','legacy') AND OLD.delivery_status IN ('sending','unknown')
  AND EXISTS(SELECT 1 FROM leads WHERE id=OLD.lead_id)
  AND EXISTS(SELECT 1 FROM buyers WHERE id=OLD.buyer_id) THEN
  INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason)
   VALUES(OLD.buyer_id,OLD.lead_id,'delivery_unknown') ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('expire_sequence_batch_dispatches','preflight_sequence_batch','sequence_batch_quarantine','sequence_batch_next_window','wait_sequence_batch','claim_legacy_sequence','begin_sequence_batch','finish_sequence_batch','defer_sequence_batch') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
