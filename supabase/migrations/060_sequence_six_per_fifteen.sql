-- Sequências IA e tradicionais: até 6 admissões por telefone, pausa mínima de 15 minutos.
-- Instalar antes do web que exibe a regra nova. Todos os executores atuais usam estas RPCs.
-- Não altera a cadência configurada por lead, STOP, leases, suppressions ou dispatches.
-- Não libera unknown, não reenvia e não zera lotes históricos (inclusive used=7..10).
-- Mantém a constraint antiga used<=10 para preservar as reservas anteriores à migração;
-- as funções abaixo impõem used<6 para qualquer nova admissão.
BEGIN;

CREATE OR REPLACE FUNCTION public.expire_sequence_batch_dispatches(p_sender text) RETURNS integer
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
  SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '15 minutes')
  WHERE sender=p_sender;
 END IF;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.finish_sequence_batch(p_id uuid,p_token uuid,p_wa text,p_choice text,p_next timestamptz,p_from text,p_to text) RETURNS boolean
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
 UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '15 minutes') WHERE sender=d.sender AND used>=6;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.defer_sequence_batch(p_id uuid,p_token uuid,p_reason text,p_next timestamptz,p_unknown boolean) RETURNS void
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
  UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '15 minutes') WHERE used>=6 AND sender=(SELECT sender FROM public.sequence_batch_dispatches WHERE token=p_token);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sequence_batch_quarantine() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.delivery_status='unknown' AND OLD.delivery_status='sending' THEN
  UPDATE public.sequence_batch_dispatches SET state='unknown' WHERE token=OLD.lease_token AND state='sending';
  UPDATE public.sequence_sender_batches SET cooldown_until=greatest(cooldown_until,clock_timestamp()+interval '15 minutes')
   WHERE used>=6 AND sender=(SELECT sender FROM public.sequence_batch_dispatches WHERE token=OLD.lease_token);
 END IF;
 RETURN NEW;
END $$;

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
   PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '15 minutes','sender_unavailable');
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
   PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '15 minutes','batch_wait');
   RETURN jsonb_build_object('allowed',false);
  END IF;
  t:=clock_timestamp();
  IF (b.cooldown_until IS NULL OR b.cooldown_until<=t) AND (b.cooldown_until IS NOT NULL AND b.cooldown_until<=t OR b.used<6 AND greatest(b.last_reserved_at,b.last_settled_at)<=t-interval '15 minutes')
   AND NOT EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='sending') THEN
   b.used:=0; b.cooldown_until:=NULL;
  END IF;
  IF b.used>=6 OR b.cooldown_until>t THEN
   due:=greatest(coalesce(b.cooldown_until,t+interval '15 minutes'),t+interval '1 second');
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
   cooldown_until=CASE WHEN b.used+1=6 THEN t+interval '15 minutes' ELSE b.cooldown_until END WHERE sender=p_sender;
 END IF;
 UPDATE public.sequence_enrollments SET generated_body=p_body,generation_status='ready',delivery_status='sending',send_started_at=t,lease_until=t+interval '2 minutes' WHERE id=p_id;
 RETURN jsonb_build_object('allowed',true);
END $$;

CREATE OR REPLACE FUNCTION public.preflight_sequence_batch(p_id uuid,p_token uuid,p_sender text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.sequence_sender_batches; t timestamptz:=clock_timestamp();
BEGIN
 PERFORM 1 FROM public.sequence_enrollments WHERE id=p_id AND status='active' AND lease_token=p_token AND lease_until>t AND delivery_status='idle' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_sender IS NULL OR p_sender !~ '^[1-9][0-9]{7,14}$' THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,t+interval '15 minutes','sender_unavailable'); RETURN false;
 END IF;
 PERFORM public.expire_sequence_batch_dispatches(p_sender);
 IF EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='unknown') THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,clock_timestamp()+interval '15 minutes','batch_wait'); RETURN false;
 END IF;
 t:=clock_timestamp();
 SELECT * INTO b FROM public.sequence_sender_batches WHERE sender=p_sender;
 IF b.cooldown_until>t OR (b.used>=6 AND EXISTS(SELECT 1 FROM public.sequence_batch_dispatches WHERE sender=p_sender AND state='sending')) THEN
  PERFORM public.wait_sequence_batch(p_id,p_token,greatest(b.cooldown_until,t+interval '1 second'),'batch_wait'); RETURN false;
 END IF;
 RETURN true;
END $$;

-- Transição conservadora: nenhuma cota nova imediata para remetentes com reservas.
-- Garante pelo menos 15 minutos a partir da migração, sem encurtar espera existente.
-- Dispatch em voo ainda prolonga essa pausa para 15 minutos após a última confirmação.
-- Unknown permanece bloqueado indefinidamente pelas funções, mesmo após cooldown.
UPDATE public.sequence_sender_batches
SET cooldown_until=greatest(
  cooldown_until,
  greatest(last_reserved_at,last_settled_at)+interval '15 minutes',
  clock_timestamp()+interval '15 minutes'
)
WHERE used>0;

-- CREATE OR REPLACE mantém owner/ACL; reafirma acesso exclusivo de service_role.
REVOKE ALL ON FUNCTION public.expire_sequence_batch_dispatches(text),
  public.finish_sequence_batch(uuid,uuid,text,text,timestamptz,text,text),
  public.defer_sequence_batch(uuid,uuid,text,timestamptz,boolean),
  public.sequence_batch_quarantine(),
  public.begin_sequence_batch(uuid,uuid,text,text),
  public.preflight_sequence_batch(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_sequence_batch_dispatches(text),
  public.finish_sequence_batch(uuid,uuid,text,text,timestamptz,text,text),
  public.defer_sequence_batch(uuid,uuid,text,timestamptz,boolean),
  public.sequence_batch_quarantine(),
  public.begin_sequence_batch(uuid,uuid,text,text),
  public.preflight_sequence_batch(uuid,uuid,text) TO service_role;
COMMIT;
