-- Opt-in only. No enrollment/backfill/activation of existing sequences.
ALTER TABLE public.sequences ADD COLUMN mode text NOT NULL DEFAULT 'legacy' CHECK(mode IN ('legacy','ai_until_reply'));
ALTER TABLE public.sequences ADD COLUMN ai_config jsonb;
ALTER TABLE public.sequence_enrollments ADD COLUMN mode text NOT NULL DEFAULT 'legacy' CHECK(mode IN ('legacy','ai_until_reply'));
ALTER TABLE public.sequence_enrollments ADD COLUMN stop_reason text;
ALTER TABLE public.sequence_enrollments ADD COLUMN generation_status text NOT NULL DEFAULT 'idle';
ALTER TABLE public.sequence_enrollments ADD COLUMN delivery_status text NOT NULL DEFAULT 'idle';
ALTER TABLE public.sequence_enrollments ADD COLUMN lease_token uuid;
ALTER TABLE public.sequence_enrollments ADD COLUMN lease_until timestamptz;
ALTER TABLE public.sequence_enrollments ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.sequence_enrollments ADD COLUMN generated_body text;
ALTER TABLE public.sequence_enrollments ADD COLUMN recent_choices jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.sequence_enrollments ADD COLUMN last_sent_at timestamptz;
ALTER TABLE public.sequence_enrollments ADD COLUMN send_started_at timestamptz;
CREATE UNIQUE INDEX one_active_ai_prospect ON public.sequence_enrollments(buyer_id,lead_id)
 WHERE mode='ai_until_reply' AND status IN ('active','paused');
-- Keep reads governed by existing ownership RLS; all mutations go through authenticated API/service role.
REVOKE INSERT, UPDATE, DELETE ON public.sequences, public.sequence_steps, public.sequence_enrollments FROM anon, authenticated;

CREATE FUNCTION public.save_sequence(p_buyer uuid, p_id uuid, p_config jsonb, p_steps jsonb DEFAULT NULL)
RETURNS public.sequences LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.sequences; step jsonb; n integer := 0; stage uuid;
BEGIN
 IF p_id IS NULL THEN
   INSERT INTO sequences(buyer_id,name,description,enabled,mode,ai_config,trigger_stage_id)
   VALUES(p_buyer,p_config->>'name',p_config->>'description',
    CASE WHEN p_config->>'mode'='ai_until_reply' THEN false ELSE coalesce((p_config->>'enabled')::boolean,true) END,
    coalesce(p_config->>'mode','legacy'),p_config->'ai_config',(p_config->>'trigger_stage_id')::uuid) RETURNING * INTO s;
 ELSE
   SELECT * INTO s FROM sequences WHERE id=p_id AND buyer_id=p_buyer FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'sequence_not_owned' USING ERRCODE='42501'; END IF;
   IF p_config ? 'mode' AND p_config->>'mode'<>s.mode THEN RAISE EXCEPTION 'mode_immutable'; END IF;
   UPDATE sequences SET name=coalesce(p_config->>'name',name),
    description=CASE WHEN p_config ? 'description' THEN p_config->>'description' ELSE description END,
    enabled=coalesce((p_config->>'enabled')::boolean,enabled),
    trigger_stage_id=CASE WHEN p_config ? 'trigger_stage_id' THEN (p_config->>'trigger_stage_id')::uuid ELSE trigger_stage_id END,
    ai_config=CASE WHEN p_config ? 'ai_config' THEN p_config->'ai_config' ELSE ai_config END,
    updated_at=now() WHERE id=p_id RETURNING * INTO s;
 END IF;
 stage := s.trigger_stage_id;
 IF stage IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pipeline_stages st JOIN pipelines p ON p.id=st.pipeline_id WHERE st.id=stage AND p.buyer_id=p_buyer) THEN
  RAISE EXCEPTION 'stage_not_owned' USING ERRCODE='42501';
 END IF;
 IF s.mode='ai_until_reply' AND (s.ai_config IS NULL OR jsonb_typeof(s.ai_config)<>'object') THEN RAISE EXCEPTION 'missing_ai_config'; END IF;
 IF p_steps IS NOT NULL THEN
  IF jsonb_typeof(p_steps)<>'array' THEN RAISE EXCEPTION 'invalid_steps'; END IF;
  DELETE FROM sequence_steps WHERE sequence_id=s.id;
  FOR step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
   IF step->>'template_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM templates WHERE id=(step->>'template_id')::uuid AND (buyer_id=p_buyer OR (is_system=true AND buyer_id IS NULL))) THEN
    RAISE EXCEPTION 'template_not_owned' USING ERRCODE='42501';
   END IF;
   INSERT INTO sequence_steps(sequence_id,step_order,delay_hours,template_id,custom_body,step_type)
    VALUES(s.id,n,(step->>'delay_hours')::integer,(step->>'template_id')::uuid,step->>'custom_body',step->>'step_type');
   n:=n+1;
  END LOOP;
 END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.save_sequence(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_sequence(uuid,uuid,jsonb,jsonb) TO service_role;

CREATE TABLE public.ai_sequence_suppressions (
 buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('replied','optout','manual','delivery_unknown')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(buyer_id,lead_id)
);
ALTER TABLE public.ai_sequence_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_sequence_suppressions FROM anon,authenticated;
GRANT ALL ON public.ai_sequence_suppressions TO service_role;

-- Parity with src/lib/lead-stage.ts is covered by local SQL tests.
CREATE FUNCTION public.ai_sequence_won(stage text) RETURNS boolean LANGUAGE sql IMMUTABLE
 SET search_path=public,pg_temp AS $$ SELECT coalesce(stage ~* 'fechado|ganho|issued|approv|emitid|vendid|\mwon\M' AND stage !~* 'not\s*approv|n[ãa]o\s*aprov|cancel|perdid',false) $$;

CREATE FUNCTION public.ai_sequence_block(p_buyer uuid,p_lead uuid,p_sequence uuid,p_since timestamptz DEFAULT NULL) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.leads; s public.sequences; reason text;
BEGIN
 SELECT * INTO l FROM leads WHERE id=p_lead;
 SELECT * INTO s FROM sequences WHERE id=p_sequence;
 IF l.id IS NULL OR s.id IS NULL OR l.assigned_to IS DISTINCT FROM p_buyer OR s.buyer_id<>p_buyer OR l.assigned_to_member IS NOT NULL THEN RETURN 'ownership_changed'; END IF;
 IF l.sms_opted_out OR EXISTS(SELECT 1 FROM ai_sequence_suppressions a WHERE a.lead_id=p_lead AND a.reason='optout') THEN RETURN 'optout'; END IF;
 SELECT a.reason INTO reason FROM ai_sequence_suppressions a WHERE a.buyer_id=p_buyer AND a.lead_id=p_lead;
 IF reason IS NOT NULL THEN RETURN reason; END IF;
 -- Use the enrollment boundary, not historical conversation. New enrollments use
 -- transaction start (also enrolled_at), so a concurrent inbound is not lost.
 p_since:=coalesce(p_since,(SELECT min(enrolled_at) FROM sequence_enrollments WHERE buyer_id=p_buyer AND lead_id=p_lead AND sequence_id=p_sequence AND mode='ai_until_reply' AND status IN ('active','paused')),now());
 IF EXISTS(SELECT 1 FROM whatsapp_messages WHERE buyer_id=p_buyer AND lead_id=p_lead AND direction='in' AND sent_at>=p_since) OR EXISTS(SELECT 1 FROM sms_messages WHERE lead_id=p_lead AND direction='in' AND created_at>=p_since) THEN RETURN 'replied'; END IF;
 IF l.contract_closed OR EXISTS(SELECT 1 FROM pipeline_leads pl JOIN pipeline_stages ps ON ps.id=pl.stage_id JOIN pipelines p ON p.id=pl.pipeline_id WHERE pl.lead_id=p_lead AND p.buyer_id=p_buyer AND ai_sequence_won(ps.name)) THEN RETURN 'sold'; END IF;
 IF l.archived THEN RETURN 'archived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buyers WHERE id=p_buyer AND is_active=true) THEN RETURN 'buyer_inactive'; END IF;
 IF s.enabled IS DISTINCT FROM true THEN RETURN 'sequence_disabled'; END IF;
 IF s.trigger_stage_id IS NOT NULL AND coalesce((s.ai_config->>'stop_on_stage_exit')::boolean,true) AND NOT EXISTS(SELECT 1 FROM pipeline_leads WHERE lead_id=p_lead AND stage_id=s.trigger_stage_id) THEN RETURN 'stage_exit'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.enroll_sequence(p_buyer uuid,p_sequence uuid,p_lead uuid,p_due timestamptz)
 RETURNS public.sequence_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.sequences; e public.sequence_enrollments; reason text;
BEGIN
 -- Serialize competing subscriptions for one prospect, including different sequences.
 -- SHARE conflicts with buyer suspension's NO KEY UPDATE. Acquire it before
 -- the lead so the suspension trigger sees a committed enrollment, or we see
 -- the committed suspension. KEY SHARE alone would not serialize is_active.
 PERFORM 1 FROM buyers WHERE id=p_buyer FOR SHARE;
 PERFORM 1 FROM leads WHERE id=p_lead AND assigned_to=p_buyer AND assigned_to_member IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_owned' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM sequences WHERE id=p_sequence AND buyer_id=p_buyer AND enabled=true FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'sequence_not_owned_or_disabled' USING ERRCODE='42501'; END IF;
 IF s.mode='ai_until_reply' THEN
  reason:=ai_sequence_block(p_buyer,p_lead,p_sequence);
  IF reason IS NOT NULL THEN RAISE EXCEPTION 'enrollment_blocked:%',reason USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO sequence_enrollments(sequence_id,lead_id,buyer_id,mode,current_step,next_run_at,status)
 VALUES(p_sequence,p_lead,p_buyer,s.mode,0,p_due,'active') RETURNING * INTO e;
 RETURN e;
END $$;

CREATE FUNCTION public.stop_ai_sequence_on_inbound() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
 PERFORM 1 FROM sequence_enrollments WHERE mode='ai_until_reply'
  AND buyer_id=owner AND lead_id=NEW.lead_id ORDER BY id FOR UPDATE;
 reason:=CASE WHEN lower(trim(coalesce(NEW.body,''))) ~ '^(stop|parar|pare|sair|cancelar|unsubscribe|baja|no me contacte)[.! ]*$' THEN 'optout' ELSE 'replied' END;
 IF reason='replied' AND NOT EXISTS(SELECT 1 FROM sequence_enrollments WHERE mode='ai_until_reply' AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND event_at>=enrolled_at) THEN RETURN NEW; END IF;
 INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(owner,NEW.lead_id,reason)
 ON CONFLICT(buyer_id,lead_id) DO UPDATE SET reason=CASE WHEN ai_sequence_suppressions.reason='optout' THEN 'optout' ELSE excluded.reason END;
 UPDATE sequence_enrollments SET status='stopped',stop_reason=reason,completed_at=now()
 WHERE mode='ai_until_reply' AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND (reason='optout' OR event_at>=enrolled_at);
 RETURN NEW;
END $$;
CREATE TRIGGER ai_stop_wa_inbound AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.stop_ai_sequence_on_inbound();
CREATE TRIGGER ai_stop_sms_inbound AFTER INSERT ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION public.stop_ai_sequence_on_inbound();

CREATE FUNCTION public.claim_ai_sequence(p_id uuid) RETURNS SETOF public.sequence_enrollments
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; reason text;
BEGIN
 SELECT * INTO e FROM sequence_enrollments WHERE id=p_id AND mode='ai_until_reply' AND status='active' AND next_run_at<=now() FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF e.lease_until>now() THEN RETURN; END IF;
 IF e.delivery_status='sending' THEN
  INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(e.buyer_id,e.lead_id,'delivery_unknown') ON CONFLICT DO NOTHING;
  UPDATE sequence_enrollments SET status='paused',stop_reason='delivery_unknown',delivery_status='unknown' WHERE id=p_id; RETURN;
 END IF;
 reason:=ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id);
 IF reason IS NOT NULL THEN
  UPDATE sequence_enrollments SET status=CASE WHEN reason='sold' THEN 'completed' ELSE 'stopped' END,stop_reason=reason,completed_at=now() WHERE id=p_id; RETURN;
 END IF;
 IF e.attempts>=3 THEN UPDATE sequence_enrollments SET status='paused',stop_reason='retry_exhausted' WHERE id=p_id; RETURN; END IF;
 RETURN QUERY UPDATE sequence_enrollments SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,generation_status='generating',delivery_status='idle'
 WHERE id=p_id RETURNING *;
END $$;

CREATE FUNCTION public.begin_ai_send(p_id uuid,p_token uuid,p_body text) RETURNS SETOF public.sequence_enrollments
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; reason text;
BEGIN
 SELECT * INTO e FROM sequence_enrollments WHERE id=p_id AND mode='ai_until_reply' AND status='active' AND lease_token=p_token AND lease_until>now() AND delivery_status='idle' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 reason:=ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id);
 IF reason IS NOT NULL THEN UPDATE sequence_enrollments SET status=CASE WHEN reason='sold' THEN 'completed' ELSE 'stopped' END,stop_reason=reason,completed_at=now() WHERE id=p_id; RETURN; END IF;
 RETURN QUERY UPDATE sequence_enrollments SET generated_body=p_body,generation_status='ready',delivery_status='sending',send_started_at=clock_timestamp(),lease_until=now()+interval '2 minutes' WHERE id=p_id RETURNING *;
END $$;

CREATE FUNCTION public.finish_ai_send(p_id uuid,p_token uuid,p_wa text,p_choice text,p_next timestamptz,p_from text,p_to text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments;
BEGIN
 SELECT * INTO e FROM sequence_enrollments WHERE id=p_id AND lease_token=p_token AND delivery_status='sending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_wa IS NULL OR p_wa='' THEN RAISE EXCEPTION 'missing_delivery_confirmation'; END IF;
 INSERT INTO whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,wa_message_id,status)
 VALUES(e.buyer_id,e.lead_id,'out',p_from,p_to,e.generated_body,p_wa,'sent') ON CONFLICT(wa_message_id) DO NOTHING;
 -- Existing webhook evidence must match this attempt, not an older bridge fallback.
 -- Unknown IDs still rely on the bridge ACK: the row inserted above is a receipt,
 -- not independent proof of delivery. Strict timestamps fail closed (including
 -- coarse provider timestamps before send_started_at); engine quarantines errors.
 IF NOT EXISTS(SELECT 1 FROM whatsapp_messages WHERE wa_message_id=p_wa AND buyer_id=e.buyer_id AND lead_id=e.lead_id AND direction='out' AND body=e.generated_body AND sent_at>=e.send_started_at AND sent_at<=clock_timestamp()) THEN RAISE EXCEPTION 'delivery_confirmation_mismatch'; END IF;
 -- A concurrent inbound may have stopped this enrollment: never set status back to active.
 UPDATE sequence_enrollments SET current_step=current_step+1,last_sent_at=now(),next_run_at=p_next,
  delivery_status='sent',attempts=0,lease_token=NULL,lease_until=NULL,
  stop_reason=CASE WHEN status='active' THEN NULL ELSE stop_reason END,
  recent_choices=(SELECT coalesce(jsonb_agg(v ORDER BY n),'[]') FROM (SELECT value v,n FROM jsonb_array_elements(e.recent_choices || jsonb_build_array(p_choice)) WITH ORDINALITY a(value,n) ORDER BY n DESC LIMIT 3) q)
 WHERE id=p_id;
 RETURN true;
END $$;

CREATE FUNCTION public.defer_ai_sequence(p_id uuid,p_token uuid,p_reason text,p_next timestamptz,p_unknown boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Every writer takes enrollment before suppression, including error recovery.
 PERFORM 1 FROM sequence_enrollments WHERE id=p_id AND lease_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_unknown THEN
  INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason)
   SELECT buyer_id,lead_id,'delivery_unknown' FROM sequence_enrollments WHERE id=p_id AND lease_token=p_token
   ON CONFLICT DO NOTHING;
 END IF;
 UPDATE sequence_enrollments SET
 status=CASE WHEN p_unknown OR (p_reason<>'outside_window' AND attempts>=3) THEN 'paused' ELSE status END,
 stop_reason=p_reason,next_run_at=p_next,lease_token=NULL,lease_until=NULL,
 generation_status=CASE WHEN delivery_status='sending' THEN generation_status ELSE 'failed' END,
 delivery_status=CASE WHEN p_unknown THEN 'unknown' ELSE 'idle' END,
 attempts=CASE WHEN p_reason='outside_window' THEN greatest(0,attempts-1) ELSE attempts END
 WHERE id=p_id AND lease_token=p_token AND status='active';
END $$;

-- Row deletion (including sequence FK cascade) locks the same enrollment as begin.
-- If begin won the race, preserve ambiguity before the enrollment can disappear;
-- if delete won, begin cannot obtain permission. The API retains its owner filter.
CREATE FUNCTION public.preserve_ai_delivery_on_delete() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- A sequence/enrollment deletion must retain the quarantine. A parent deletion
 -- has already removed the lead/buyer in this transaction; do not recreate an
 -- orphan suppression from the cascade (its foreign keys must remain valid).
 IF OLD.mode='ai_until_reply' AND OLD.delivery_status IN ('sending','unknown')
  AND EXISTS(SELECT 1 FROM leads WHERE id=OLD.lead_id)
  AND EXISTS(SELECT 1 FROM buyers WHERE id=OLD.buyer_id) THEN
  INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason)
   VALUES(OLD.buyer_id,OLD.lead_id,'delivery_unknown') ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.preserve_ai_delivery_on_delete() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preserve_ai_delivery_on_delete() TO service_role;
CREATE TRIGGER ai_preserve_delivery BEFORE DELETE ON public.sequence_enrollments
 FOR EACH ROW EXECUTE FUNCTION public.preserve_ai_delivery_on_delete();

CREATE FUNCTION public.stop_sequence_enrollment(p_buyer uuid,p_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments;
BEGIN
 SELECT * INTO e FROM sequence_enrollments WHERE id=p_id AND buyer_id=p_buyer FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF e.mode='ai_until_reply' THEN
 INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(e.buyer_id,e.lead_id,'manual') ON CONFLICT DO NOTHING;
 END IF;
 UPDATE sequence_enrollments SET status='stopped',stop_reason='manual',completed_at=now() WHERE id=p_id;
 RETURN true;
END $$;

-- Cancellation is recorded at the data mutation, not just when cron next runs.
CREATE FUNCTION public.recheck_ai_sequences() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; why text; target uuid;
BEGIN
 IF TG_TABLE_NAME='pipeline_leads' THEN target:=CASE WHEN TG_OP='DELETE' THEN OLD.lead_id ELSE NEW.lead_id END;
 ELSE target:=NEW.id; END IF;
 IF TG_TABLE_NAME='leads' THEN
  IF NEW.sms_opted_out=true AND NEW.assigned_to IS NOT NULL THEN
   -- Include stopped enrollments: a manual stop may still be committing its
   -- suppression, and opt-out must win without aborting the lead update.
   PERFORM 1 FROM sequence_enrollments WHERE mode='ai_until_reply'
    AND lead_id=NEW.id ORDER BY id FOR UPDATE;
   INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason) VALUES(NEW.assigned_to,NEW.id,'optout')
   ON CONFLICT(buyer_id,lead_id) DO UPDATE SET reason='optout';
  END IF;
 END IF;
 FOR e IN SELECT * FROM sequence_enrollments WHERE mode='ai_until_reply' AND status IN ('active','paused') AND
  CASE TG_TABLE_NAME WHEN 'leads' THEN lead_id=target WHEN 'pipeline_leads' THEN lead_id=target
   WHEN 'buyers' THEN buyer_id=target WHEN 'sequences' THEN sequence_id=target ELSE false END
 ORDER BY id FOR UPDATE LOOP
  why:=ai_sequence_block(e.buyer_id,e.lead_id,e.sequence_id);
  IF why IS NOT NULL THEN
   UPDATE sequence_enrollments SET status=CASE WHEN why='sold' THEN 'completed' ELSE 'stopped' END,stop_reason=why,completed_at=now() WHERE id=e.id;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER ai_recheck_lead AFTER UPDATE OF assigned_to,assigned_to_member,archived,contract_closed,sms_opted_out ON public.leads FOR EACH ROW EXECUTE FUNCTION public.recheck_ai_sequences();
CREATE TRIGGER ai_recheck_buyer AFTER UPDATE OF is_active ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.recheck_ai_sequences();
CREATE TRIGGER ai_recheck_sequence AFTER UPDATE OF enabled,trigger_stage_id,ai_config ON public.sequences FOR EACH ROW EXECUTE FUNCTION public.recheck_ai_sequences();
CREATE TRIGGER ai_recheck_stage AFTER INSERT OR UPDATE OR DELETE ON public.pipeline_leads FOR EACH ROW EXECUTE FUNCTION public.recheck_ai_sequences();

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('ai_sequence_won','ai_sequence_block','enroll_sequence','stop_ai_sequence_on_inbound','claim_ai_sequence','begin_ai_send','finish_ai_send','defer_ai_sequence','stop_sequence_enrollment','recheck_ai_sequences') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
