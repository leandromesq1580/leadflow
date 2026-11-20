-- Approval required. No backfill: historical appointments never enqueue.
BEGIN;
CREATE TABLE public.equipe_notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 buyer_id uuid NOT NULL REFERENCES public.buyers(id),
 request_id text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
 kind text NOT NULL CHECK(kind IN ('confirmation','reminder')),
 scheduled_for timestamptz NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown')),
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 invalidated_by_reschedule boolean NOT NULL DEFAULT false,
 next_attempt_at timestamptz NOT NULL,
 UNIQUE(appointment_id,channel,kind,scheduled_for)
);
ALTER TABLE public.equipe_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipe_notification_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.equipe_notification_outbox TO service_role;
CREATE INDEX equipe_notification_due ON public.equipe_notification_outbox(status,next_attempt_at);
CREATE FUNCTION public.equipe_enqueue_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l leads%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  -- Do not turn edits to historical appointments into historical notifications.
  IF NOT EXISTS(SELECT 1 FROM equipe_notification_outbox WHERE appointment_id=NEW.id) THEN RETURN NEW; END IF;
  -- Only this explicit provenance can reopen a never-attempted email reminder.
  -- Cancellation also revokes provenance from earlier superseded slots.
  IF NEW.status NOT IN ('scheduled','confirmed') THEN
   UPDATE equipe_notification_outbox SET invalidated_by_reschedule=false
   WHERE appointment_id=NEW.id AND invalidated_by_reschedule;
  END IF;
  UPDATE equipe_notification_outbox SET status='failed',updated_at=now(),
   invalidated_by_reschedule=(channel='email' AND kind='reminder'
    AND attempts=0 AND first_attempt_at IS NULL
    AND scheduled_for IS DISTINCT FROM NEW.scheduled_at
    AND NEW.status IN ('scheduled','confirmed'))
  WHERE appointment_id=NEW.id AND status='pending'
   AND (scheduled_for IS DISTINCT FROM NEW.scheduled_at OR NEW.status NOT IN ('scheduled','confirmed'));
  IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN RETURN NEW; END IF;
 END IF;
 IF NEW.status NOT IN ('scheduled','confirmed') OR NEW.scheduled_at<=now() THEN RETURN NEW; END IF;
 SELECT * INTO l FROM leads WHERE id=NEW.lead_id AND raw_data->>'source'='landing_equipe';
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM buyers WHERE id=NEW.buyer_id AND email='regiane@myhomefirst.us') THEN RETURN NEW; END IF;
 INSERT INTO equipe_notification_outbox(appointment_id,lead_id,buyer_id,request_id,channel,kind,scheduled_for,payload,next_attempt_at)
 SELECT NEW.id,l.id,NEW.buyer_id,l.raw_data->>'requestId',c.channel,c.kind,NEW.scheduled_at,
 jsonb_build_object('name',l.name,'email',l.email,'phone',l.phone,'locale',l.raw_data->>'idioma','timezone',l.raw_data->>'fuso','slot',NEW.scheduled_at),
 CASE WHEN c.kind='reminder' THEN NEW.scheduled_at-interval '1 hour' ELSE now() END
 FROM (VALUES ('email','confirmation'),('whatsapp','confirmation'),('email','reminder')) c(channel,kind)
 ON CONFLICT (appointment_id,channel,kind,scheduled_for) DO UPDATE
 SET status='pending',updated_at=now(),next_attempt_at=EXCLUDED.next_attempt_at,
  invalidated_by_reschedule=false
 WHERE equipe_notification_outbox.channel='email' AND equipe_notification_outbox.kind='reminder'
  AND equipe_notification_outbox.status='failed' AND equipe_notification_outbox.invalidated_by_reschedule
  AND equipe_notification_outbox.attempts=0 AND equipe_notification_outbox.first_attempt_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER equipe_enqueue_notifications AFTER INSERT OR UPDATE OF scheduled_at,status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.equipe_enqueue_notifications();
CREATE FUNCTION public.equipe_claim_notifications(request_id_filter text DEFAULT NULL)
RETURNS SETOF public.equipe_notification_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- WA has no remote idempotency: ambiguous/crashed sends require manual review.
 UPDATE equipe_notification_outbox SET status='unknown',updated_at=now()
 WHERE status='sending' AND updated_at<now()-interval '5 minutes' AND channel='whatsapp';
 -- Resend key lifetime starts on the FIRST attempt, not booking creation.
 UPDATE equipe_notification_outbox SET status='failed',updated_at=now()
 WHERE status IN ('pending','sending') AND (first_attempt_at<now()-interval '23 hours' OR attempts>=5)
 AND updated_at<now()-interval '5 minutes';
 RETURN QUERY
 WITH due AS (
 SELECT o.id FROM equipe_notification_outbox o JOIN appointments a ON a.id=o.appointment_id
 WHERE (request_id_filter IS NULL OR o.request_id=request_id_filter)
 AND a.status IN ('scheduled','confirmed') AND a.scheduled_at>now() AND a.scheduled_at=o.scheduled_for
 AND (o.first_attempt_at IS NULL OR o.first_attempt_at>now()-interval '23 hours') AND o.attempts<5
 AND ((o.status='pending' AND o.next_attempt_at<=now()) OR
 (o.channel='email' AND o.status='sending' AND o.updated_at<now()-interval '5 minutes'))
 ORDER BY o.next_attempt_at,o.id LIMIT 10 FOR UPDATE OF o SKIP LOCKED
 ) UPDATE equipe_notification_outbox o SET status='sending',attempts=o.attempts+1,updated_at=now(),first_attempt_at=coalesce(o.first_attempt_at,now())
 FROM due WHERE o.id=due.id RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.equipe_enqueue_notifications() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.equipe_claim_notifications(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.equipe_claim_notifications(text) TO service_role;
COMMIT;
