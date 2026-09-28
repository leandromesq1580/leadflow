-- 051_availability_evening_until_8am.sql — paridade SQL ↔ TypeScript da NOITE.
-- Rodar manualmente no Supabase (SQL Editor) — OBRIGATÓRIA depois da 049.
--
-- Por quê: a 049 (24/09) copiou a disponibilidade pra SQL com a regra ANTIGA da noite
-- (18h–20h). A regra vigente (17/09, availability.ts) é: NOITE = 18h até 7:59 do dia
-- seguinte; madrugada (0h–7h) pertence à noite do dia ANTERIOR; as 24h têm período.
-- Sem esta migration, assign_paid_lead_with_credit recusa entregas entre 21h e 7:59
-- que o app considera dentro da janela (lead fica pendente).
BEGIN;

CREATE OR REPLACE FUNCTION public.automatic_buyer_available(
  p_buyer_id uuid, p_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text;
  v_local timestamp;
  v_hour integer;
  v_day_ts timestamp;
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
  -- 0h–7h = fim da noite que começou às 18h do dia ANTERIOR (calendário local,
  -- sem aritmética de horas reais — igual ao giro do nome do dia no TypeScript).
  v_day_ts := CASE WHEN v_hour < 8 THEN v_local - interval '1 day' ELSE v_local END;
  v_day := CASE extract(dow FROM v_day_ts) WHEN 0 THEN 'sunday' WHEN 6 THEN 'saturday' ELSE 'weekday' END;
  v_period := CASE WHEN v_hour BETWEEN 8 AND 11 THEN 'morning'
    WHEN v_hour BETWEEN 12 AND 17 THEN 'afternoon'
    ELSE 'evening' END;  -- 18..23 e 0..7
  RETURN EXISTS (SELECT 1 FROM public.buyer_availability
    WHERE buyer_id = p_buyer_id AND day_type = v_day AND period = v_period
      AND (coalesce(cardinality(hours), 0) = 0 OR v_hour = ANY(hours)));
END;
$$;
REVOKE ALL ON FUNCTION public.automatic_buyer_available(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automatic_buyer_available(uuid, timestamptz) TO service_role;

COMMIT;
