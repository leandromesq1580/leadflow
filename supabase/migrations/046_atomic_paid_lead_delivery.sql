BEGIN;

-- A buyer is eligible only when the NET balance for the requested language is
-- positive. Expired positive balances are ignored, but a negative balance is
-- always carried forward so a new purchase first pays that delivery debt.
CREATE OR REPLACE FUNCTION public.get_eligible_buyers_by_language(
  p_product_type text,
  p_state text,
  p_language text
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  notification_email boolean,
  notification_sms boolean,
  leads_count bigint,
  credit_id uuid,
  remaining bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH balances AS (
    SELECT c.buyer_id,
      sum(
        CASE
          WHEN c.total_purchased - c.total_used < 0
            THEN c.total_purchased - c.total_used
          WHEN c.expires_at IS NULL OR c.expires_at > now()
            THEN c.total_purchased - c.total_used
          ELSE 0
        END
      )::bigint AS net_remaining
    FROM public.credits c
    WHERE c.type = p_product_type AND c.lead_language = p_language
    GROUP BY c.buyer_id
  )
  SELECT b.id, b.name, b.email, b.phone, b.notification_email, b.notification_sms,
    (SELECT count(*) FROM public.leads l WHERE l.assigned_to = b.id
      AND l.lead_language = p_language AND l.created_at >= now() - interval '30 days'),
    spendable.id, balances.net_remaining
  FROM balances
  JOIN public.buyers b ON b.id = balances.buyer_id
  JOIN LATERAL (
    SELECT c.id
    FROM public.credits c
    WHERE c.buyer_id = b.id AND c.type = p_product_type
      AND c.lead_language = p_language
      AND c.total_purchased > c.total_used
      AND (c.expires_at IS NULL OR c.expires_at > now())
    ORDER BY c.purchased_at ASC, c.id ASC
    LIMIT 1
  ) spendable ON true
  WHERE balances.net_remaining > 0
    AND b.is_active = true
    AND (p_state IS NULL OR EXISTS (
      SELECT 1 FROM public.buyer_states s
      WHERE s.buyer_id = b.id AND s.state_code = p_state
    ))
  ORDER BY balances.net_remaining DESC, spendable.id ASC;
$$;
REVOKE ALL ON FUNCTION public.get_eligible_buyers_by_language(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_eligible_buyers_by_language(text, text, text)
  TO service_role;

-- Atomic paid delivery. The lead assignment and the debit happen in the same
-- transaction, after locking both the lead and every relevant credit row.
CREATE OR REPLACE FUNCTION public.assign_paid_lead_with_credit(
  p_lead_id uuid,
  p_buyer_id uuid,
  p_language text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_credit_id uuid;
  v_net_remaining bigint;
BEGIN
  IF p_language IS NULL OR p_language NOT IN ('pt', 'es') THEN
    RAISE EXCEPTION 'Invalid lead language';
  END IF;

  -- Serializes competing deliveries for the same buyer and protects the lead
  -- from being delivered twice by webhook/poll retries.
  PERFORM 1 FROM public.leads
    WHERE id = p_lead_id AND assigned_to IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM 1 FROM public.credits
    WHERE buyer_id = p_buyer_id AND type = 'lead' AND lead_language = p_language
    ORDER BY id
    FOR UPDATE;

  SELECT coalesce(sum(
    CASE
      WHEN total_purchased - total_used < 0 THEN total_purchased - total_used
      WHEN expires_at IS NULL OR expires_at > now() THEN total_purchased - total_used
      ELSE 0
    END
  ), 0)::bigint
  INTO v_net_remaining
  FROM public.credits
  WHERE buyer_id = p_buyer_id AND type = 'lead' AND lead_language = p_language;

  IF v_net_remaining <= 0 THEN RETURN NULL; END IF;

  SELECT id INTO v_credit_id
  FROM public.credits
  WHERE buyer_id = p_buyer_id AND type = 'lead' AND lead_language = p_language
    AND total_purchased > total_used
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY purchased_at ASC, id ASC
  LIMIT 1
  FOR UPDATE;
  IF v_credit_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.credits
    SET total_used = total_used + 1
    WHERE id = v_credit_id;

  UPDATE public.leads
    SET assigned_to = p_buyer_id,
        assigned_at = now(),
        status = 'assigned',
        delivery_credit_id = v_credit_id,
        updated_at = now()
    WHERE id = p_lead_id AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead assignment race for %', p_lead_id;
  END IF;
  RETURN v_credit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_paid_lead_with_credit(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_paid_lead_with_credit(uuid, uuid, text)
  TO service_role;

COMMIT;
