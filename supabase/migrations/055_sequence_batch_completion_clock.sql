-- Apply after 054, before releasing the identity fix. No enrollment reactivation.
-- Reservations are not delivery times: a partial batch must not reset until
-- five minutes after its last confirmed/ambiguous completion, with no in-flight
-- member. Full batches retain 054's cooldown after the final completion.
BEGIN;
ALTER TABLE public.sequence_sender_batches
 ADD COLUMN last_settled_at timestamptz NOT NULL DEFAULT clock_timestamp();
-- The default conservatively starts a new five-minute observation period for
-- existing partial batches; no historical completion time is invented.

CREATE FUNCTION public.settle_sequence_batch_dispatch() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.state='sending' AND NEW.state IN ('sent','unknown') THEN
  -- Existing lock order: enrollment/suppression (if any) -> ledger -> sender.
  -- Includes expiry of orphans, STOP/deletion, claim recovery and lost responses.
  UPDATE public.sequence_sender_batches
   SET last_settled_at=greatest(last_settled_at,clock_timestamp())
   WHERE sender=NEW.sender;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sequence_batch_settled AFTER UPDATE OF state ON public.sequence_batch_dispatches
 FOR EACH ROW EXECUTE FUNCTION public.settle_sequence_batch_dispatch();
REVOKE ALL ON FUNCTION public.settle_sequence_batch_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sequence_batch_dispatch() TO service_role;

CREATE OR REPLACE FUNCTION public.begin_sequence_batch(p_id uuid,p_token uuid,p_sender text,p_body text) RETURNS jsonb
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
  -- A timed-out worker may still send: retain its capacity until reconciled.
  -- Read ledger without locking it after sender (preserve ledger -> sender order).
  IF EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='unknown') THEN
   PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '5 minutes','batch_wait');
   RETURN jsonb_build_object('allowed',false);
  END IF;
  t:=clock_timestamp();
  IF (b.cooldown_until IS NULL OR b.cooldown_until<=t) AND (b.cooldown_until IS NOT NULL AND b.cooldown_until<=t OR b.used<10 AND greatest(b.last_reserved_at,b.last_settled_at)<=t-interval '5 minutes')
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
-- CREATE OR REPLACE retains begin_sequence_batch's service-role-only ACL.
CREATE INDEX sequence_batch_unknown_sender ON public.sequence_batch_dispatches(sender) WHERE state='unknown';

CREATE OR REPLACE FUNCTION public.preflight_sequence_batch(p_id uuid,p_token uuid,p_sender text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.sequence_sender_batches; t timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM public.sequence_enrollments WHERE id=p_id AND status='active' AND lease_token=p_token AND lease_until>t AND delivery_status='idle' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_sender IS NULL OR p_sender !~ '^[1-9][0-9]{7,14}$' THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,t+interval '5 minutes','sender_unavailable'); RETURN false;
 END IF;
 PERFORM public.expire_sequence_batch_dispatches(p_sender);
 IF EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='unknown') THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '5 minutes','batch_wait'); RETURN false;
 END IF;
 t:=clock_timestamp();
 SELECT * INTO b FROM public.sequence_sender_batches WHERE sender=p_sender;
 IF b.cooldown_until>t OR (b.used>=10 AND EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='sending')) THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,greatest(b.cooldown_until,t+interval '1 second'),'batch_wait'); RETURN false;
 END IF;
 RETURN true;
END $$;
-- Existing preflight ACL remains service-role only. No automatic hold resolution.
COMMIT;
