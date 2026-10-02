-- Optional reply routing. NULL preserves existing sequences; no backfill or activation.
BEGIN;
ALTER TABLE public.sequences ADD COLUMN reply_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.sequences.reply_stage_id IS 'Optional commercial inbound destination; NULL disables. Same owner and, if triggered, same pipeline.';
-- Polling automations must not treat this deliberately silent movement as stage entry/staleness.
ALTER TABLE public.pipeline_leads ADD COLUMN sequence_reply_moved_at timestamptz;
COMMENT ON COLUMN public.pipeline_leads.sequence_reply_moved_at IS 'Suppress stage automations for a sequence-reply movement. Cleared by a subsequent ordinary move.';

CREATE OR REPLACE FUNCTION public.save_sequence(p_buyer uuid, p_id uuid, p_config jsonb, p_steps jsonb DEFAULT NULL)
RETURNS public.sequences LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.sequences; step jsonb; n integer:=0; stage uuid; reply uuid; trigger_pipeline uuid; reply_pipeline uuid;
BEGIN
 IF p_id IS NOT NULL THEN
  SELECT * INTO s FROM sequences WHERE id=p_id AND buyer_id=p_buyer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sequence_not_owned' USING ERRCODE='42501'; END IF;
  IF p_config ? 'mode' AND p_config->>'mode'<>s.mode THEN RAISE EXCEPTION 'mode_immutable'; END IF;
 END IF;
 -- Validate the combined effective state BEFORE touching foreign keys. Omission preserves, JSON null disables.
 stage:=CASE WHEN p_config ? 'trigger_stage_id' THEN (p_config->>'trigger_stage_id')::uuid ELSE s.trigger_stage_id END;
 reply:=CASE WHEN p_config ? 'reply_stage_id' THEN (p_config->>'reply_stage_id')::uuid ELSE s.reply_stage_id END;
 IF stage IS NOT NULL THEN
  SELECT st.pipeline_id INTO trigger_pipeline FROM pipeline_stages st JOIN pipelines p ON p.id=st.pipeline_id
   WHERE st.id=stage AND p.buyer_id=p_buyer FOR SHARE OF st,p;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage_not_owned' USING ERRCODE='42501'; END IF;
 END IF;
 IF reply IS NOT NULL THEN
  SELECT st.pipeline_id INTO reply_pipeline FROM pipeline_stages st JOIN pipelines p ON p.id=st.pipeline_id
   WHERE st.id=reply AND p.buyer_id=p_buyer FOR SHARE OF st,p;
  IF NOT FOUND THEN RAISE EXCEPTION 'reply_stage_not_owned' USING ERRCODE='42501'; END IF;
  IF stage IS NOT NULL AND trigger_pipeline<>reply_pipeline THEN
   RAISE EXCEPTION 'reply_stage_pipeline_mismatch' USING ERRCODE='22023';
  END IF;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO sequences(buyer_id,name,description,enabled,mode,ai_config,trigger_stage_id,reply_stage_id)
  VALUES(p_buyer,p_config->>'name',p_config->>'description',
   CASE WHEN p_config->>'mode'='ai_until_reply' THEN false ELSE coalesce((p_config->>'enabled')::boolean,true) END,
   coalesce(p_config->>'mode','legacy'),p_config->'ai_config',stage,reply) RETURNING * INTO s;
 ELSE
  UPDATE sequences SET name=coalesce(p_config->>'name',name),
   description=CASE WHEN p_config ? 'description' THEN p_config->>'description' ELSE description END,
   enabled=coalesce((p_config->>'enabled')::boolean,enabled),trigger_stage_id=stage,reply_stage_id=reply,
   ai_config=CASE WHEN p_config ? 'ai_config' THEN p_config->'ai_config' ELSE ai_config END,
   updated_at=now() WHERE id=p_id RETURNING * INTO s;
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

CREATE FUNCTION public.clear_sequence_reply_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.stage_id IS DISTINCT FROM OLD.stage_id OR NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id OR NEW.moved_at IS DISTINCT FROM OLD.moved_at THEN
  -- Ordinary writers do not set a fresh reply marker. Also protect direct SQL moves without a new moved_at.
  IF NEW.sequence_reply_moved_at IS NOT DISTINCT FROM OLD.sequence_reply_moved_at THEN
   NEW.sequence_reply_moved_at:=NULL;
   IF NEW.moved_at IS NOT DISTINCT FROM OLD.moved_at THEN NEW.moved_at:=clock_timestamp(); END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clear_sequence_reply_move BEFORE UPDATE OF stage_id,pipeline_id,moved_at ON public.pipeline_leads
 FOR EACH ROW EXECUTE FUNCTION public.clear_sequence_reply_move();
REVOKE ALL ON FUNCTION public.clear_sequence_reply_move() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_sequence_reply_move() TO service_role;

-- Service-only, feature-specific outbox. No FKs: deleted inputs remain auditable.
CREATE TABLE public.sequence_reply_moves (
 id uuid PRIMARY KEY, buyer_id uuid NOT NULL, lead_id uuid NOT NULL,
 snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','moved','cancelled')),
 outcome text, attempts integer NOT NULL DEFAULT 0, last_sqlstate text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz
);
ALTER TABLE public.sequence_reply_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sequence_reply_moves FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sequence_reply_moves TO service_role;
CREATE INDEX sequence_reply_moves_due ON public.sequence_reply_moves(next_attempt_at,id) WHERE status='pending';
-- Durable write-ahead intent piggybacks on the REQUIRED suppression write. An
-- accessory queue INSERT/UPDATE failure therefore cannot lose inbound or intent.
ALTER TABLE public.ai_sequence_suppressions ADD COLUMN reply_move_intent jsonb;
ALTER TABLE public.ai_sequence_suppressions ADD COLUMN reply_move_due_at timestamptz;
CREATE INDEX sequence_reply_intent_due ON public.ai_sequence_suppressions(reply_move_due_at,buyer_id,lead_id) WHERE reply_move_intent IS NOT NULL;

-- Monotonic revisions reject unsafe A->B->A changes while an intent is pending.
ALTER TABLE public.leads ADD COLUMN reply_move_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.buyers ADD COLUMN reply_move_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.sequences ADD COLUMN reply_move_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.pipelines ADD COLUMN reply_move_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.pipeline_stages ADD COLUMN reply_move_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.bump_sequence_reply_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY TG_ARGV LOOP
  IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k THEN NEW.reply_move_version:=OLD.reply_move_version+1; EXIT; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER reply_version_lead BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.bump_sequence_reply_version('assigned_to','assigned_to_member','archived','contract_closed','sms_opted_out');
CREATE TRIGGER reply_version_buyer BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.bump_sequence_reply_version('is_active');
CREATE TRIGGER reply_version_sequence BEFORE UPDATE ON public.sequences FOR EACH ROW EXECUTE FUNCTION public.bump_sequence_reply_version('buyer_id','enabled','trigger_stage_id','reply_stage_id','ai_config','mode','name','description','updated_at');
CREATE TRIGGER reply_version_pipeline BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.bump_sequence_reply_version('buyer_id');
CREATE TRIGGER reply_version_stage BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.bump_sequence_reply_version('pipeline_id');

-- Called only after taking lead -> enrollments -> suppressions. All reverse-order
-- locks are NOWAIT; a manual move, delete or configuration writer always wins.
CREATE FUNCTION public.attempt_sequence_reply_move(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.sequence_reply_moves; v jsonb; c public.pipeline_leads; e public.sequence_enrollments; s public.sequences;
 why text; moved timestamptz; target uuid; pipe uuid;
BEGIN
 SELECT * INTO j FROM sequence_reply_moves WHERE id=p_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR j.status<>'pending' THEN RETURN 'terminal'; END IF;
 BEGIN
  target:=(j.snapshot->>'target')::uuid; pipe:=(j.snapshot->>'pipeline')::uuid;
  -- Inbound owns current buyer enrollments already. Fence other-owner history too,
  -- before the card's recheck trigger can acquire these locks in reverse order.
  PERFORM 1 FROM sequence_enrollments WHERE lead_id=j.lead_id ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM ai_sequence_suppressions WHERE lead_id=j.lead_id ORDER BY buyer_id FOR UPDATE NOWAIT;
  PERFORM 1 FROM buyers WHERE id=j.buyer_id FOR SHARE NOWAIT;
  PERFORM 1 FROM sequences WHERE id IN (SELECT (value->>'sequence')::uuid FROM jsonb_array_elements(j.snapshot->'candidates')) ORDER BY id FOR SHARE NOWAIT;
  PERFORM 1 FROM pipeline_leads WHERE lead_id=j.lead_id ORDER BY id FOR UPDATE NOWAIT;
  PERFORM 1 FROM pipelines WHERE id=pipe OR id IN (SELECT pipeline_id FROM pipeline_leads WHERE lead_id=j.lead_id) ORDER BY id FOR SHARE NOWAIT;
  PERFORM 1 FROM pipeline_stages WHERE id=target OR id IN (SELECT stage_id FROM pipeline_leads WHERE lead_id=j.lead_id) ORDER BY id FOR SHARE NOWAIT;
  SELECT * INTO c FROM pipeline_leads WHERE id=(j.snapshot->>'card')::uuid AND lead_id=j.lead_id;
  IF NOT EXISTS(SELECT 1 FROM leads WHERE id=j.lead_id) THEN why:='lead_deleted';
  ELSIF NOT EXISTS(SELECT 1 FROM leads WHERE id=j.lead_id AND assigned_to=j.buyer_id AND assigned_to_member IS NULL AND NOT archived AND NOT contract_closed AND NOT sms_opted_out AND reply_move_version=(j.snapshot->>'lead_version')::bigint) THEN why:='lead_changed';
  ELSIF NOT EXISTS(SELECT 1 FROM buyers WHERE id=j.buyer_id AND is_active AND reply_move_version=(j.snapshot->>'buyer_version')::bigint) THEN why:='buyer_changed';
  ELSIF NOT EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE buyer_id=j.buyer_id AND lead_id=j.lead_id AND reason='replied')
    OR EXISTS(SELECT 1 FROM ai_sequence_suppressions WHERE lead_id=j.lead_id AND (reason='optout' OR (buyer_id=j.buyer_id AND reason<>'replied' AND NOT(reason='delivery_unknown' AND resolved_at IS NOT NULL)))) THEN why:='suppression_changed';
  ELSIF EXISTS(SELECT 1 FROM sequence_enrollments WHERE lead_id=j.lead_id AND (delivery_status='unknown' OR (buyer_id=j.buyer_id AND status IN ('active','paused')))) THEN why:='enrollment_changed';
  ELSIF (j.snapshot->>'conflicting')::boolean THEN why:='conflicting_destinations';
  ELSIF NOT EXISTS(SELECT 1 FROM pipeline_stages st JOIN pipelines p ON p.id=st.pipeline_id WHERE st.id=target AND p.id=pipe AND p.buyer_id=j.buyer_id AND st.reply_move_version=(j.snapshot->>'target_version')::bigint AND p.reply_move_version=(j.snapshot->>'pipeline_version')::bigint) THEN why:='target_changed_or_deleted';
  ELSIF c.id IS NULL THEN why:='card_deleted_or_missing';
  ELSIF c.pipeline_id IS DISTINCT FROM pipe OR c.stage_id IS DISTINCT FROM (j.snapshot->>'source')::uuid OR c.moved_at IS DISTINCT FROM (j.snapshot->>'moved_at')::timestamptz THEN why:='manual_movement';
  ELSIF EXISTS(SELECT 1 FROM pipeline_leads pl JOIN pipeline_stages st ON st.id=pl.stage_id JOIN pipelines p ON p.id=pl.pipeline_id WHERE pl.lead_id=j.lead_id AND p.buyer_id=j.buyer_id AND ai_sequence_won(st.name)) THEN why:='closed_stage';
  END IF;
  IF why IS NULL THEN
   FOR v IN SELECT value FROM jsonb_array_elements(j.snapshot->'candidates') LOOP
    SELECT * INTO e FROM sequence_enrollments WHERE id=(v->>'enrollment')::uuid;
    SELECT * INTO s FROM sequences WHERE id=(v->>'sequence')::uuid;
    IF e.id IS NULL OR s.id IS NULL THEN why:='enrollment_or_sequence_deleted';
    ELSIF e.sequence_id<>s.id OR e.buyer_id<>j.buyer_id OR e.lead_id<>j.lead_id OR e.enrolled_at IS DISTINCT FROM (v->>'enrolled_at')::timestamptz OR e.status<>'stopped' OR e.stop_reason IS DISTINCT FROM 'replied' THEN why:='enrollment_changed';
    ELSIF s.reply_move_version<>(v->>'version')::bigint OR s.buyer_id<>j.buyer_id OR NOT s.enabled OR s.reply_stage_id IS DISTINCT FROM target THEN why:='sequence_changed';
    -- Temporal guard applies to EVERY enrollment, not only stage-triggered ones.
    ELSIF c.moved_at IS NULL OR c.moved_at>e.enrolled_at THEN why:='manual_movement';
    ELSIF s.trigger_stage_id IS NOT NULL AND (c.stage_id<>s.trigger_stage_id OR NOT EXISTS(SELECT 1 FROM pipeline_stages WHERE id=s.trigger_stage_id AND pipeline_id=pipe)) THEN why:='source_changed';
    END IF;
    EXIT WHEN why IS NOT NULL;
   END LOOP;
  END IF;
  IF why IS NULL AND c.stage_id=target THEN why:='already_at_target'; END IF;
  IF why IS NULL THEN
   moved:=clock_timestamp();
   UPDATE pipeline_leads SET stage_id=target,moved_at=moved,sequence_reply_moved_at=moved WHERE id=c.id;
   UPDATE sequence_reply_moves SET status='moved',outcome='moved',finished_at=moved,attempts=attempts+1,last_sqlstate=NULL WHERE id=j.id;
   RETURN 'moved';
  END IF;
  UPDATE sequence_reply_moves SET status='cancelled',outcome=why,finished_at=clock_timestamp(),attempts=attempts+1,last_sqlstate=NULL WHERE id=j.id;
  RETURN 'cancelled';
 EXCEPTION WHEN query_canceled OR OTHERS THEN
  -- Failed card UPDATE also rolls back its polling marker; intent stays durable.
  UPDATE sequence_reply_moves SET attempts=attempts+1,last_sqlstate=SQLSTATE,outcome='retry',next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=j.id;
  RETURN 'pending';
 END;
END $$;

CREATE FUNCTION public.materialize_sequence_reply_move(p_buyer uuid,p_lead uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb; v_id uuid;
BEGIN
 SELECT reply_move_intent INTO v FROM ai_sequence_suppressions WHERE buyer_id=p_buyer AND lead_id=p_lead FOR UPDATE NOWAIT;
 IF v IS NULL THEN RETURN NULL; END IF;
 v_id:=(v->>'id')::uuid;
 INSERT INTO sequence_reply_moves(id,buyer_id,lead_id,snapshot) VALUES(v_id,p_buyer,p_lead,v) ON CONFLICT DO NOTHING;
 UPDATE ai_sequence_suppressions SET reply_move_intent=NULL,reply_move_due_at=NULL WHERE buyer_id=p_buyer AND lead_id=p_lead;
 RETURN v_id;
END $$;

CREATE FUNCTION public.drain_sequence_reply_moves(p_limit integer DEFAULT 25) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; v_id uuid; n integer:=0;
BEGIN
 -- Bounded selection and bounded attempts per execution, both modes together.
 -- Do not hold a queue lock while waiting for a lead/enrollment held by inbound.
 FOR r IN SELECT * FROM (
  (SELECT id,buyer_id,lead_id,next_attempt_at AS due FROM sequence_reply_moves WHERE status='pending' AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,id LIMIT least(greatest(coalesce(p_limit,25),1),100))
  UNION ALL
  (SELECT (reply_move_intent->>'id')::uuid,buyer_id,lead_id,reply_move_due_at FROM ai_sequence_suppressions WHERE reply_move_intent IS NOT NULL AND reply_move_due_at<=clock_timestamp() ORDER BY reply_move_due_at,buyer_id,lead_id LIMIT least(greatest(coalesce(p_limit,25),1),100))
 ) jobs ORDER BY due,id LIMIT least(greatest(coalesce(p_limit,25),1),100) LOOP
  BEGIN
   PERFORM 1 FROM leads WHERE leads.id=r.lead_id FOR NO KEY UPDATE SKIP LOCKED;
   IF NOT FOUND AND EXISTS(SELECT 1 FROM leads WHERE leads.id=r.lead_id) THEN CONTINUE; END IF;
   PERFORM 1 FROM sequence_enrollments WHERE lead_id=r.lead_id ORDER BY sequence_enrollments.id FOR UPDATE NOWAIT;
   PERFORM 1 FROM ai_sequence_suppressions WHERE lead_id=r.lead_id ORDER BY buyer_id FOR UPDATE NOWAIT;
   -- SKIP LOCKED makes duplicate worker selections harmless even for deleted leads.
   IF EXISTS(SELECT 1 FROM sequence_reply_moves WHERE sequence_reply_moves.id=r.id) THEN
    PERFORM 1 FROM sequence_reply_moves WHERE sequence_reply_moves.id=r.id AND status='pending' AND next_attempt_at<=clock_timestamp() FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_id:=r.id;
   ELSE
    v_id:=materialize_sequence_reply_move(r.buyer_id,r.lead_id);
   END IF;
   IF v_id IS NOT NULL THEN PERFORM attempt_sequence_reply_move(v_id); n:=n+1; END IF;
  EXCEPTION WHEN query_canceled OR OTHERS THEN
   -- A failed materialization leaves the required suppression outbox untouched.
   -- No counter update can jeopardize inbound, and no exception aborts the batch.
   RAISE LOG 'sequence_reply_drain_retry SQLSTATE=%',SQLSTATE;
  END;
 END LOOP;
 RETURN n;
END $$;

-- Preserve audit even if a parent is deleted before fallback materialization.
CREATE FUNCTION public.preserve_sequence_reply_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.reply_move_intent IS NOT NULL THEN
  INSERT INTO sequence_reply_moves(id,buyer_id,lead_id,snapshot,status,outcome,finished_at)
  VALUES((OLD.reply_move_intent->>'id')::uuid,OLD.buyer_id,OLD.lead_id,OLD.reply_move_intent,'cancelled','suppression_or_parent_deleted',clock_timestamp()) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER preserve_reply_intent BEFORE DELETE ON public.ai_sequence_suppressions FOR EACH ROW EXECUTE FUNCTION public.preserve_sequence_reply_intent();

CREATE OR REPLACE FUNCTION public.stop_ai_sequence_on_inbound() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner uuid; reason text; event_at timestamptz; candidates jsonb; destinations uuid[];
 target uuid; target_pipeline uuid; card public.pipeline_leads; intent jsonb; id uuid;
BEGIN
 IF NEW.direction<>'in' OR NEW.lead_id IS NULL THEN RETURN NEW; END IF;
 -- Preserve 054 ordering: lead NO KEY UPDATE -> all enrollments ordered -> suppression.
 PERFORM 1 FROM leads WHERE leads.id=NEW.lead_id FOR NO KEY UPDATE;
 IF TG_TABLE_NAME='whatsapp_messages' THEN owner:=NEW.buyer_id; event_at:=NEW.sent_at;
 ELSE SELECT assigned_to INTO owner FROM leads WHERE leads.id=NEW.lead_id; event_at:=NEW.created_at; END IF;
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM leads WHERE leads.id=NEW.lead_id AND assigned_to=owner) THEN RETURN NEW; END IF;
 PERFORM 1 FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy')
  AND buyer_id=owner AND lead_id=NEW.lead_id ORDER BY sequence_enrollments.id FOR UPDATE;
 reason:=CASE WHEN lower(trim(coalesce(NEW.body,''))) ~ '^(stop|stopall|cancel|end|quit|parar|pare|sair|cancelar|unsubscribe|baja|no me contacte)[.! ]*$' THEN 'optout' ELSE 'replied' END;
 IF reason='replied' AND NOT EXISTS(SELECT 1 FROM sequence_enrollments WHERE mode IN ('ai_until_reply','legacy') AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND event_at>=enrolled_at) THEN RETURN NEW; END IF;
 -- Unlocked MVCC snapshot: harmless target renames cannot delay the mandatory stop.
 -- Revisions + card identity/moved_at are validated under locks before any movement.
 IF reason='replied'
  AND EXISTS(SELECT 1 FROM leads WHERE leads.id=NEW.lead_id AND assigned_to_member IS NULL AND NOT sms_opted_out AND NOT archived AND NOT contract_closed)
  AND NOT EXISTS(SELECT 1 FROM ai_sequence_suppressions a WHERE a.lead_id=NEW.lead_id AND
   (a.reason='optout' OR (a.buyer_id=owner AND NOT (a.reason='delivery_unknown' AND a.resolved_at IS NOT NULL))))
  AND NOT EXISTS(SELECT 1 FROM sequence_enrollments WHERE buyer_id=owner AND lead_id=NEW.lead_id AND delivery_status='unknown') THEN
  SELECT jsonb_agg(jsonb_build_object('enrollment',e.id,'sequence',s.id,'enrolled_at',e.enrolled_at,'version',s.reply_move_version) ORDER BY e.id),array_agg(DISTINCT s.reply_stage_id ORDER BY s.reply_stage_id) INTO candidates,destinations
   FROM sequence_enrollments e JOIN sequences s ON s.id=e.sequence_id
   WHERE e.buyer_id=owner AND e.lead_id=NEW.lead_id AND s.buyer_id=owner AND s.enabled=true
    AND e.status IN ('active','paused') AND event_at>=e.enrolled_at AND s.reply_stage_id IS NOT NULL;
 END IF;
 IF candidates IS NOT NULL THEN
  target:=destinations[1];
  SELECT pipeline_id INTO target_pipeline FROM pipeline_stages WHERE pipeline_stages.id=target;
  SELECT * INTO card FROM pipeline_leads WHERE lead_id=NEW.lead_id AND pipeline_id=target_pipeline;
  intent:=jsonb_build_object('id',gen_random_uuid(),'reply_at',event_at,'candidates',candidates,'target',target,'pipeline',target_pipeline,
   'conflicting',cardinality(destinations)<>1,'card',card.id,'source',card.stage_id,'moved_at',card.moved_at,
   'lead_version',(SELECT reply_move_version FROM leads WHERE leads.id=NEW.lead_id),
   'buyer_version',(SELECT reply_move_version FROM buyers WHERE buyers.id=owner),
   'target_version',(SELECT reply_move_version FROM pipeline_stages WHERE pipeline_stages.id=target),
   'pipeline_version',(SELECT reply_move_version FROM pipelines WHERE pipelines.id=target_pipeline));
 END IF;
 -- Intent is written atomically with the pre-existing required suppression + stop.
 -- No separate accessory INSERT can turn a durable intent into a best-effort move.
 INSERT INTO ai_sequence_suppressions(buyer_id,lead_id,reason,reply_move_intent,reply_move_due_at)
 VALUES(owner,NEW.lead_id,reason,intent,CASE WHEN intent IS NOT NULL THEN clock_timestamp() END)
 ON CONFLICT(buyer_id,lead_id) DO UPDATE SET
  reason=CASE WHEN ai_sequence_suppressions.reason='optout' THEN 'optout' ELSE excluded.reason END,
  reply_move_intent=coalesce(ai_sequence_suppressions.reply_move_intent,excluded.reply_move_intent),
  reply_move_due_at=coalesce(ai_sequence_suppressions.reply_move_due_at,excluded.reply_move_due_at);
 UPDATE sequence_enrollments SET status='stopped',stop_reason=reason,completed_at=now()
 WHERE mode IN ('ai_until_reply','legacy') AND buyer_id=owner AND lead_id=NEW.lead_id AND status IN ('active','paused') AND (reason='optout' OR event_at>=enrolled_at);
 IF intent IS NOT NULL THEN
  BEGIN
   id:=materialize_sequence_reply_move(owner,NEW.lead_id);
   IF id IS NOT NULL THEN PERFORM attempt_sequence_reply_move(id); END IF;
  EXCEPTION WHEN query_canceled OR OTHERS THEN
   -- Roll back accessory work only. The durable suppression intent remains for cron.
   RAISE LOG 'sequence_reply_outbox_retry SQLSTATE=%',SQLSTATE;
  END;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('bump_sequence_reply_version','attempt_sequence_reply_move','materialize_sequence_reply_move','drain_sequence_reply_moves','preserve_sequence_reply_intent','save_sequence','stop_ai_sequence_on_inbound') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
