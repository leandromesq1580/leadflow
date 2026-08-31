BEGIN;

-- Existing purchases and bonuses remain BR. Known Spanish-form leads are labeled
-- without changing ownership, charges, or the original submitted contact data.
ALTER TABLE public.credits ADD COLUMN lead_language text NOT NULL DEFAULT 'pt'
  CHECK (lead_language IN ('pt', 'es'));
ALTER TABLE public.payments ADD COLUMN lead_language text NOT NULL DEFAULT 'pt'
  CHECK (lead_language IN ('pt', 'es'));
ALTER TABLE public.leads ADD COLUMN lead_language text DEFAULT 'pt'
  CHECK (lead_language IN ('pt', 'es'));
UPDATE public.leads SET lead_language = 'es' WHERE form_name = '1963007337624994';
CREATE INDEX credits_language_balance_idx ON public.credits (buyer_id, type, lead_language);
CREATE INDEX leads_language_queue_idx ON public.leads (lead_language, status, created_at);

CREATE FUNCTION public.get_eligible_buyers_by_language(p_product_type text, p_state text, p_language text)
RETURNS TABLE (id uuid, name text, email text, phone text, notification_email boolean,
  notification_sms boolean, leads_count bigint, credit_id uuid, remaining bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.email, b.phone, b.notification_email, b.notification_sms,
    (SELECT count(*) FROM public.leads l WHERE l.assigned_to = b.id
      AND l.lead_language = p_language AND l.created_at >= now() - interval '30 days'),
    c.id, (c.total_purchased - c.total_used)::bigint
  FROM public.buyers b JOIN public.credits c ON c.buyer_id = b.id
  WHERE b.is_active = true AND c.type = p_product_type AND c.lead_language = p_language
    AND c.total_purchased > c.total_used AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (p_state IS NULL OR EXISTS (SELECT 1 FROM public.buyer_states s WHERE s.buyer_id = b.id AND s.state_code = p_state))
  ORDER BY (c.total_purchased - c.total_used) DESC, c.purchased_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_eligible_buyers_by_language(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_eligible_buyers_by_language(text, text, text) TO service_role;

-- Payment and its language-specific credits are committed together. Repeated
-- Stripe events cannot create a second pack or mix the two language balances.
CREATE FUNCTION public.fulfill_lead_purchase(
  p_buyer_id uuid, p_session_id text, p_payment_intent_id text,
  p_product_type text, p_language text, p_quantity integer,
  p_price_per_unit numeric, p_amount numeric
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_product_type IS NULL OR p_product_type NOT IN ('lead', 'cold_lead', 'appointment')
    OR p_language IS NULL OR p_language NOT IN ('pt', 'es')
    OR p_quantity IS NULL OR p_quantity < 1 OR p_price_per_unit IS NULL OR p_price_per_unit < 0
    OR p_amount IS NULL OR p_amount < 0 OR p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'Invalid lead purchase';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id, 0));
  IF EXISTS (SELECT 1 FROM public.payments WHERE stripe_session_id = p_session_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.payments (buyer_id, stripe_session_id, stripe_payment_intent_id,
    product_type, lead_language, quantity, price_per_unit, amount, status)
  VALUES (p_buyer_id, p_session_id, p_payment_intent_id, p_product_type, p_language,
    p_quantity, p_price_per_unit, p_amount, 'completed');
  -- Cold leads keep the existing manual spreadsheet fulfillment, with language
  -- shown in the payment and admin notification instead of entering the queue.
  IF p_product_type <> 'cold_lead' THEN
    INSERT INTO public.credits (buyer_id, type, lead_language, total_purchased,
      total_used, price_per_unit, stripe_payment_id, purchased_at)
    VALUES (p_buyer_id, p_product_type, p_language, p_quantity, 0,
      p_price_per_unit, coalesce(p_payment_intent_id, p_session_id), now());
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfill_lead_purchase(uuid, text, text, text, text, integer, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_lead_purchase(uuid, text, text, text, text, integer, numeric, numeric) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
