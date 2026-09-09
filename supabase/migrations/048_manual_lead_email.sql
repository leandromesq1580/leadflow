-- Manual lead email only. Apply separately with operator approval; never from the app.
CREATE TABLE IF NOT EXISTS public.manual_email_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  recipient_count integer NOT NULL CHECK (recipient_count BETWEEN 0 AND 20),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, request_id)
);
CREATE INDEX IF NOT EXISTS manual_email_batches_owner_time ON public.manual_email_batches (buyer_id, created_at DESC);

-- Tokens are opaque capabilities; never expose them through the browser's DB client.
-- Scope is the sender account + normalized mailbox, not a lead row (duplicate leads cannot bypass opt-out).
CREATE TABLE IF NOT EXISTS public.manual_email_preferences (
  buyer_id uuid NOT NULL REFERENCES public.buyers(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  suppressed_at timestamptz,
  PRIMARY KEY (buyer_id, email)
);
ALTER TABLE public.manual_email_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_email_batches, public.manual_email_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manual_email_batches, public.manual_email_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_manual_email(p_buyer_id uuid, p_request_id uuid, p_hash text, p_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch public.manual_email_batches;
  minute_count bigint;
  day_count bigint;
BEGIN
  IF p_buyer_id IS NULL OR p_request_id IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
     OR p_count IS NULL OR p_count NOT BETWEEN 0 AND 20 THEN
    RAISE EXCEPTION 'Invalid manual email reservation';
  END IF;
  -- Serialize quota checks and reservations across serverless instances for this account.
  PERFORM pg_advisory_xact_lock(hashtextextended('manual-email:' || p_buyer_id::text, 0));
  SELECT * INTO batch FROM public.manual_email_batches WHERE buyer_id = p_buyer_id AND request_id = p_request_id;
  IF FOUND THEN RETURN to_jsonb(batch) || jsonb_build_object('fresh', false); END IF;
  -- Also protect refresh/new-tab/repeated clicks with a different client request key.
  SELECT * INTO batch FROM public.manual_email_batches
    WHERE buyer_id = p_buyer_id AND payload_hash = p_hash AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(batch) || jsonb_build_object('fresh', false); END IF;
  SELECT coalesce(sum(greatest(recipient_count, 1)) FILTER (WHERE created_at > now() - interval '1 minute'), 0),
         coalesce(sum(greatest(recipient_count, 1)), 0)
    INTO minute_count, day_count FROM public.manual_email_batches
    WHERE buyer_id = p_buyer_id AND created_at > now() - interval '24 hours';
  IF minute_count + greatest(p_count, 1) > 20 OR day_count + greatest(p_count, 1) > 100 THEN
    RETURN jsonb_build_object('limited', true);
  END IF;
  INSERT INTO public.manual_email_batches (buyer_id, request_id, payload_hash, recipient_count, status, results)
    VALUES (p_buyer_id, p_request_id, p_hash, p_count, 'processing', '[]'::jsonb) RETURNING * INTO batch;
  RETURN to_jsonb(batch) || jsonb_build_object('fresh', true);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_manual_email(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_manual_email(uuid, uuid, text, integer) TO service_role;
