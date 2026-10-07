-- Preventive only: migration -> bridge v2 -> web. No historical reconciliation.
BEGIN;
ALTER TABLE public.sequence_batch_dispatches
 DROP CONSTRAINT sequence_batch_dispatches_state_check,
 ADD CONSTRAINT sequence_batch_dispatches_state_check
  CHECK(state IN ('sending','sent','unknown','rejected_before_send')),
 ADD COLUMN rejected_at timestamptz,
 ADD COLUMN rejection_proof jsonb,
 ADD CONSTRAINT sequence_batch_rejection_evidence CHECK(
  CASE WHEN state='rejected_before_send' THEN rejected_at IS NOT NULL AND rejection_proof IS NOT NULL
  ELSE rejected_at IS NULL AND rejection_proof IS NULL END
 );

-- Preserve the completion clock for ALL existing terminal paths. Rejection also
-- consumes its reserved slot until the current full/partial window ends.
CREATE OR REPLACE FUNCTION public.settle_sequence_batch_dispatch() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 IF OLD.state='sending' AND NEW.state IN ('sent','unknown','rejected_before_send') THEN
  UPDATE public.sequence_sender_batches
   SET last_settled_at=greatest(last_settled_at,t),
    cooldown_until=CASE WHEN NEW.state='rejected_before_send' AND used=10
     THEN greatest(cooldown_until,t+interval '5 minutes') ELSE cooldown_until END
   WHERE sender=NEW.sender;
 END IF;
 RETURN NEW;
END $$;

-- Trusted service-role attestation from the authenticated bridge's v2 response,
-- NOT a public recovery API and NOT cryptographic proof. No textual error inference.
-- Locks: enrollment -> existing suppression -> ledger -> sender. Never re-arm a
-- stopped/paused enrollment, remove a suppression, advance a step or write a receipt.
CREATE FUNCTION public.reject_sequence_batch(
 p_id uuid,p_token uuid,p_cycle timestamptz,p_step integer,p_sender text,p_proof jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.sequence_enrollments; d public.sequence_batch_dispatches; t timestamptz;
BEGIN
 IF p_id IS NULL OR p_token IS NULL OR p_cycle IS NULL OR p_step IS NULL OR p_step<0
  OR p_sender IS NULL OR p_sender !~ '^[1-9][0-9]{7,14}$'
  OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
  OR coalesce(p_proof->>'code','') NOT IN ('bridge_not_ready','recipient_unavailable','invalid_payload')
  OR p_proof IS DISTINCT FROM jsonb_build_object('version',2,'operation_id',p_token::text,
   'sender',p_sender,'outcome','rejected_before_send','code',p_proof->>'code') THEN RETURN false;
 END IF;
 SELECT * INTO e FROM public.sequence_enrollments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR e.enrolled_at IS DISTINCT FROM p_cycle OR e.current_step IS DISTINCT FROM p_step THEN RETURN false; END IF;
 PERFORM 1 FROM public.ai_sequence_suppressions WHERE buyer_id=e.buyer_id AND lead_id=e.lead_id FOR UPDATE;
 SELECT * INTO d FROM public.sequence_batch_dispatches
  WHERE enrollment_id=p_id AND token=p_token AND cycle=p_cycle AND step=p_step AND sender=p_sender FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF d.state='rejected_before_send' THEN
  RETURN d.rejection_proof=p_proof AND e.delivery_status='rejected_before_send' AND e.lease_token IS NULL;
 END IF;
 IF d.state<>'sending' OR e.lease_token IS DISTINCT FROM p_token OR e.delivery_status<>'sending' THEN RETURN false; END IF;
 PERFORM 1 FROM public.sequence_sender_batches WHERE sender=p_sender FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Check deadlines AFTER every potentially blocking lock. Expired/unknown is never
 -- resolved even if a valid-looking proof arrives later; expiry is not cancellation.
 t:=clock_timestamp();
 IF e.lease_until IS NULL OR e.lease_until<=t OR d.expires_at<=t THEN RETURN false; END IF;
 UPDATE public.sequence_batch_dispatches SET state='rejected_before_send',rejected_at=t,rejection_proof=p_proof WHERE token=p_token;
 UPDATE public.sequence_enrollments SET
  delivery_status='rejected_before_send',lease_token=NULL,lease_until=NULL,
  status=CASE WHEN status='active' THEN 'paused' ELSE status END,
  stop_reason=CASE WHEN status='active' THEN 'send_rejected_before_send' ELSE stop_reason END
 WHERE id=p_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reject_sequence_batch(uuid,uuid,timestamptz,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sequence_batch(uuid,uuid,timestamptz,integer,text,jsonb) TO service_role;
-- settle_sequence_batch_dispatch retains its existing service-role-only ACL.
COMMIT;
