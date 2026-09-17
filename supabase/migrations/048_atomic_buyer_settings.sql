BEGIN;

-- PATCH semantics for settings: SQL NULL preserves a collection, [] clears it.
-- The API authenticates owner/admin; direct client execution is forbidden.
-- One transaction + a buyer row lock prevent partial replacement/interleaving.
CREATE OR REPLACE FUNCTION public.save_buyer_settings(
  p_buyer_id uuid,
  p_profile jsonb DEFAULT '{}'::jsonb,
  p_states text[] DEFAULT NULL,
  p_availability jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  previous public.buyers%ROWTYPE;
  replacement public.buyers%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid profile' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_profile) AS k(key)
    WHERE key NOT IN ('name','phone','whatsapp','notification_phone_2','cal_link',
      'notification_email','notification_sms','is_agency','team_distribution_mode')) THEN
    RAISE EXCEPTION 'Invalid profile field' USING ERRCODE = '22023';
  END IF;
  IF p_availability IS NOT NULL AND jsonb_typeof(p_availability) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid availability' USING ERRCODE = '22023';
  END IF;
  IF p_states IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_states) AS s(code)
    WHERE code IS NULL OR code !~ '^[A-Z]{2}$') THEN
    RAISE EXCEPTION 'Invalid state' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO previous FROM public.buyers WHERE id = p_buyer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Buyer not found' USING ERRCODE = 'P0002'; END IF;
  IF p_profile <> '{}'::jsonb THEN
    replacement := jsonb_populate_record(previous, p_profile);
    UPDATE public.buyers SET
      name = replacement.name, phone = replacement.phone, whatsapp = replacement.whatsapp,
      notification_phone_2 = replacement.notification_phone_2, cal_link = replacement.cal_link,
      notification_email = replacement.notification_email, notification_sms = replacement.notification_sms,
      is_agency = replacement.is_agency, team_distribution_mode = replacement.team_distribution_mode,
      updated_at = now()
    WHERE id = p_buyer_id;
  END IF;

  IF p_states IS NOT NULL THEN
    DELETE FROM public.buyer_states WHERE buyer_id = p_buyer_id;
    INSERT INTO public.buyer_states(buyer_id, state_code)
      SELECT p_buyer_id, code FROM (SELECT DISTINCT unnest(p_states) AS code) AS states;
  END IF;
  IF p_availability IS NOT NULL THEN
    DELETE FROM public.buyer_availability WHERE buyer_id = p_buyer_id;
    INSERT INTO public.buyer_availability(buyer_id, day_type, period, hours)
      SELECT p_buyer_id, a.day_type, a.period, a.hours
      FROM jsonb_to_recordset(p_availability) AS a(day_type text, period text, hours integer[]);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_buyer_settings(uuid,jsonb,text[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_buyer_settings(uuid,jsonb,text[],jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
