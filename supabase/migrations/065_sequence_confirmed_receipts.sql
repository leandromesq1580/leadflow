-- Additive installation before web; no historical backfill, activation or resend.
BEGIN;
ALTER TABLE public.sequence_batch_dispatches
 ADD COLUMN confirmed_wa_id text,
 ADD COLUMN confirmed_at timestamptz;

-- Only the trusted engine may provide an acknowledgement already validated against
-- version=2, operation_id=token and sender. This RPC is NOT a transport permission.
-- It never sends, claims/rearms an enrollment, or matches a receipt by text alone.
CREATE FUNCTION public.confirm_sequence_delivery(
 p_id uuid,p_token uuid,p_wa text,p_choice text,p_next timestamptz,p_from text,p_to text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp SET lock_timeout='3s' AS $$
DECLARE
 e public.sequence_enrollments;
 d public.sequence_batch_dispatches;
 w public.whatsapp_messages;
 sender_key text;
 confirmed_time timestamptz;
BEGIN
 IF p_wa IS NULL OR length(p_wa)=0 OR length(p_wa)>512 OR p_wa ~ '\s'
 OR p_from IS NULL OR p_from !~ '^[1-9][0-9]{7,14}$'
 OR p_to IS NULL OR p_to !~ '^[1-9][0-9]{7,14}$' OR p_next IS NULL THEN RETURN false; END IF;
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT sender INTO sender_key FROM public.sequence_batch_dispatches WHERE token=p_token AND enrollment_id=p_id;
 IF sender_key IS DISTINCT FROM p_from THEN RETURN false; END IF;
 -- Same lock order as the current finish RPC: enrollment -> sender -> dispatch.
 PERFORM 1 FROM public.sequence_sender_batches WHERE sender=sender_key FOR UPDATE;
 SELECT * INTO d FROM public.sequence_batch_dispatches WHERE token=p_token AND enrollment_id=p_id FOR UPDATE;
 IF NOT FOUND OR d.sender IS DISTINCT FROM p_from OR d.cycle IS DISTINCT FROM e.enrolled_at
 OR d.state NOT IN ('sending','unknown','sent') THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=e.lead_id
   AND regexp_replace(phone,'[^0-9]','','g')=p_to) THEN RETURN false; END IF;
 SELECT * INTO w FROM public.whatsapp_messages WHERE wa_message_id=p_wa;
 IF FOUND AND (w.buyer_id IS DISTINCT FROM e.buyer_id OR w.lead_id IS DISTINCT FROM e.lead_id
   OR w.direction IS DISTINCT FROM 'out' OR w.body IS DISTINCT FROM e.generated_body
   OR regexp_replace(w.from_phone,'[^0-9]','','g') IS DISTINCT FROM p_from
   OR regexp_replace(w.to_phone,'[^0-9]','','g') IS DISTINCT FROM p_to
   OR w.sent_at<d.started_at) THEN RETURN false; END IF;
 IF d.state='sent' THEN
   -- A previous finish can commit and lose its HTTP response. Check the precise
   -- receipt and original cycle/step; a boolean from a generic retry is not proof.
   IF e.current_step<>d.step+1 OR w.wa_message_id IS DISTINCT FROM p_wa
   OR (d.confirmed_wa_id IS NOT NULL AND d.confirmed_wa_id<>p_wa) THEN RETURN false; END IF;
   UPDATE public.sequence_batch_dispatches SET confirmed_wa_id=p_wa,confirmed_at=coalesce(confirmed_at,w.sent_at) WHERE token=p_token;
   RETURN true;
 END IF;
 IF e.current_step<>d.step OR e.generated_body IS NULL
 OR e.delivery_status NOT IN ('sending','unknown') THEN RETURN false; END IF;
 confirmed_time:=coalesce(w.sent_at,clock_timestamp());
 -- The valid current lease retains the original transition/legacy scheduling.
 IF public.finish_sequence_batch(p_id,p_token,p_wa,p_choice,p_next,p_from,p_to) THEN
   UPDATE public.sequence_batch_dispatches SET confirmed_wa_id=p_wa,confirmed_at=confirmed_time WHERE token=p_token;
   RETURN true;
 END IF;
 -- The same operation's late acknowledgement is terminal evidence. It resolves
 -- only the dispatch. Any STOP, reply, manual pause or expired-lease pause stays.
 INSERT INTO public.whatsapp_messages(lead_id,buyer_id,from_phone,to_phone,body,direction,wa_message_id,sent_at)
 VALUES(e.lead_id,e.buyer_id,p_from,p_to,e.generated_body,'out',p_wa,confirmed_time)
 ON CONFLICT(wa_message_id) DO NOTHING;
 SELECT * INTO w FROM public.whatsapp_messages WHERE wa_message_id=p_wa;
 IF w.buyer_id IS DISTINCT FROM e.buyer_id OR w.lead_id IS DISTINCT FROM e.lead_id
 OR w.direction IS DISTINCT FROM 'out' OR w.body IS DISTINCT FROM e.generated_body
 OR regexp_replace(w.from_phone,'[^0-9]','','g') IS DISTINCT FROM p_from
 OR regexp_replace(w.to_phone,'[^0-9]','','g') IS DISTINCT FROM p_to
 THEN RAISE EXCEPTION 'sequence_receipt_conflict'; END IF;
 UPDATE public.ai_sequence_suppressions SET resolved_at=clock_timestamp()
 WHERE buyer_id=e.buyer_id AND lead_id=e.lead_id AND reason='delivery_unknown' AND resolved_at IS NULL;
 UPDATE public.sequence_enrollments SET
   current_step=current_step+1,last_sent_at=confirmed_time,delivery_status='sent',attempts=0,
   recent_choices=CASE WHEN e.mode='ai_until_reply' THEN
     (SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) FROM
       (SELECT value v,ord FROM jsonb_array_elements(e.recent_choices||jsonb_build_array(p_choice))
        WITH ORDINALITY a(value,ord) ORDER BY ord DESC LIMIT 3) q)
     ELSE e.recent_choices END,
   status=CASE WHEN e.status='active' THEN 'paused' ELSE e.status END,
   stop_reason=CASE WHEN e.status='active' OR (e.status='paused' AND e.stop_reason='delivery_unknown')
     THEN 'delivery_confirmed_paused' ELSE e.stop_reason END,
   lease_token=NULL,lease_until=NULL WHERE id=p_id;
 UPDATE public.sequence_batch_dispatches SET state='sent',confirmed_wa_id=p_wa,confirmed_at=confirmed_time WHERE token=p_token;
 UPDATE public.sequence_sender_batches SET last_settled_at=greatest(last_settled_at,clock_timestamp()),
   cooldown_until=CASE WHEN used>=6 THEN clock_timestamp()+interval '15 minutes' ELSE cooldown_until END WHERE sender=sender_key;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_sequence_delivery(uuid,uuid,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sequence_delivery(uuid,uuid,text,text,timestamptz,text,text) TO service_role;
COMMENT ON FUNCTION public.confirm_sequence_delivery(uuid,uuid,text,text,timestamptz,text,text)
 IS 'Idempotent persistence of a correlated v2 transport acknowledgement; no resend or reactivation.';
COMMIT;
