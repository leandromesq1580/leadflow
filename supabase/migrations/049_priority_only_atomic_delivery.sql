BEGIN;

-- Parity with availability.ts: predominant licensed-state zone, east-first tie;
-- no rows = 24/7, null/empty hours = full period, holidays are not inferred.
-- Called AFTER locking the buyer, which serializes saves through migration 048.
CREATE OR REPLACE FUNCTION public.automatic_buyer_available(
  p_buyer_id uuid, p_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text;
  v_local timestamp;
  v_hour integer;
  v_day text;
  v_period text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.buyer_availability WHERE buyer_id = p_buyer_id) THEN
    RETURN true;
  END IF;
  SELECT z.tz INTO v_tz FROM public.buyer_states s
  JOIN (VALUES
    (1, 'America/New_York', ARRAY['CT','DE','FL','GA','IN','KY','ME','MD','MA','MI','NH','NJ','NY','NC','OH','PA','RI','SC','VT','VA','WV','DC']),
    (2, 'America/Chicago', ARRAY['AL','AR','IL','IA','KS','LA','MN','MS','MO','NE','ND','OK','SD','TN','TX','WI']),
    (3, 'America/Denver', ARRAY['AZ','CO','ID','MT','NM','UT','WY']),
    (4, 'America/Los_Angeles', ARRAY['CA','NV','OR','WA']),
    (5, 'America/Anchorage', ARRAY['AK']),
    (6, 'Pacific/Honolulu', ARRAY['HI'])
  ) AS z(priority, tz, states) ON upper(s.state_code) = ANY(z.states)
  WHERE s.buyer_id = p_buyer_id
  GROUP BY z.tz, z.priority ORDER BY count(*) DESC, z.priority LIMIT 1;
  v_local := p_at AT TIME ZONE coalesce(v_tz, 'America/New_York');
  v_hour := extract(hour FROM v_local)::integer;
  v_day := CASE extract(dow FROM v_local) WHEN 0 THEN 'sunday' WHEN 6 THEN 'saturday' ELSE 'weekday' END;
  v_period := CASE WHEN v_hour BETWEEN 8 AND 11 THEN 'morning'
    WHEN v_hour BETWEEN 12 AND 17 THEN 'afternoon'
    WHEN v_hour BETWEEN 18 AND 20 THEN 'evening' END;
  RETURN EXISTS (SELECT 1 FROM public.buyer_availability
    WHERE buyer_id = p_buyer_id AND day_type = v_day AND period = v_period
      AND (coalesce(cardinality(hours), 0) = 0 OR v_hour = ANY(hours)));
END;
$$;
REVOKE ALL ON FUNCTION public.automatic_buyer_available(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_buyer_available(uuid, timestamptz) TO service_role;

-- Incremental replacement of 046: same signature and service-role-only access.
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
  v_routing jsonb;
  v_buyer public.buyers%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_max numeric;
  v_received bigint;
  v_now timestamptz;
  v_day date;
BEGIN
  IF p_language IS NULL OR p_language NOT IN ('pt', 'es') THEN
    RAISE EXCEPTION 'Invalid lead language';
  END IF;

  -- Lock order for every paid delivery: routing -> buyer -> lead -> credits.
  -- SHARE permits concurrent deliveries, but a settings CAS must wait until
  -- assignment/debit commit. NO KEY UPDATE serializes a buyer without blocking
  -- foreign-key KEY SHARE locks; it also cooperates with save_buyer_settings.
  SELECT value INTO v_routing FROM public.settings
    WHERE key = 'lead_routing' FOR SHARE;
  SELECT * INTO v_buyer FROM public.buyers
    WHERE id = p_buyer_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_lead FROM public.leads
    WHERE id = p_lead_id AND assigned_to IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Re-read policy under locks, never trust the caller's earlier JS snapshot.
  -- OFF and non-system/manual/appointment delivery keep the previous policy.
  v_now := clock_timestamp();
  IF v_routing->'priority_only' = 'true'::jsonb
      AND v_lead.meta_lead_id IS NOT NULL AND v_lead.product_type = 'lead' THEN
    IF NOT coalesce(v_buyer.is_active, false)
        OR v_lead.lead_language IS DISTINCT FROM p_language
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            coalesce(v_routing#>'{admin_rule,admin_emails}', '[]'::jsonb)) AS e(email)
          WHERE lower(btrim(e.email)) = lower(btrim(v_buyer.email))
        ) THEN RETURN NULL; END IF;

    IF nullif(v_lead.state, '') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.buyer_states
      WHERE buyer_id = p_buyer_id AND state_code = upper(v_lead.state)
    ) THEN RETURN NULL; END IF;

    IF NOT public.automatic_buyer_available(p_buyer_id, v_now) THEN RETURN NULL; END IF;

    v_max := (v_routing#>>'{admin_rule,daily_max}')::numeric;
    IF v_max IS NOT NULL THEN
      -- Business day, including DST; count system assignments, NOT creation,
      -- manual imports or credit lots. The existing cap is per buyer/language.
      v_day := (v_now AT TIME ZONE 'America/New_York')::date;
      SELECT count(*) INTO v_received FROM public.leads
        WHERE assigned_to = p_buyer_id AND meta_lead_id IS NOT NULL
          AND lead_language = p_language
          AND assigned_at >= (v_day::timestamp AT TIME ZONE 'America/New_York')
          AND assigned_at < ((v_day + 1)::timestamp AT TIME ZONE 'America/New_York');
      IF v_max <= 0 OR v_received >= v_max THEN RETURN NULL; END IF;
    END IF;
  END IF;

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

  UPDATE public.credits SET total_used = total_used + 1 WHERE id = v_credit_id;
  UPDATE public.leads
    SET assigned_to = p_buyer_id,
        assigned_at = v_now,
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
-- Automatic staff priority/fallback only. Manual assignments use their existing
-- paths. ONLY requires paid delivery even for a selected staff member: an old
-- free/OFF decision must be retried, never upgraded to a free ONLY delivery.
CREATE OR REPLACE FUNCTION public.assign_automatic_free_lead(
  p_lead_id uuid, p_buyer_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_routing jsonb;
  v_lead public.leads%ROWTYPE;
BEGIN
  SELECT value INTO v_routing FROM public.settings
    WHERE key = 'lead_routing' FOR SHARE;
  PERFORM 1 FROM public.buyers
    WHERE id = p_buyer_id AND is_active = true FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_lead FROM public.leads
    WHERE id = p_lead_id AND assigned_to IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_routing->'priority_only' = 'true'::jsonb
      AND v_lead.meta_lead_id IS NOT NULL AND v_lead.product_type = 'lead' THEN
    RETURN false;
  END IF;
  UPDATE public.leads SET assigned_to = p_buyer_id,
    assigned_at = clock_timestamp(), status = 'assigned', delivery_credit_id = NULL,
    updated_at = now()
    WHERE id = p_lead_id AND assigned_to IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_automatic_free_lead(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_automatic_free_lead(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
