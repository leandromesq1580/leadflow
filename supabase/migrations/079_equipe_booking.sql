-- Recruitment bookings use the existing sales calendar. No credentials/tables added.
-- Apply only after explicit approval, before publishing the /equipe frontend.
BEGIN;

-- All writers to this sales calendar serialize on its buyer row. Existing
-- non-recruitment overlaps are not changed; conflicts involving recruitment
-- are rejected even when the other writer is /nova or the dashboard.
CREATE OR REPLACE FUNCTION public.equipe_guard_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_recruit boolean;
BEGIN
  IF NEW.status NOT IN ('scheduled','confirmed') THEN RETURN NEW; END IF;
  PERFORM 1 FROM buyers WHERE id=NEW.buyer_id AND email='regiane@myhomefirst.us' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(raw_data->>'source'='landing_equipe',false) INTO is_recruit FROM leads WHERE id=NEW.lead_id;
  IF EXISTS (
    SELECT 1 FROM appointments a JOIN leads l ON l.id=a.lead_id
    WHERE a.buyer_id=NEW.buyer_id AND a.id<>NEW.id
      AND a.status IN ('scheduled','confirmed')
      AND a.scheduled_at > NEW.scheduled_at - interval '30 minutes'
      AND a.scheduled_at < NEW.scheduled_at + interval '30 minutes'
      AND (is_recruit OR l.raw_data->>'source'='landing_equipe')
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.equipe_guard_appointment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS equipe_guard_appointment ON public.appointments;
CREATE TRIGGER equipe_guard_appointment BEFORE INSERT OR UPDATE OF scheduled_at,status,buyer_id,lead_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.equipe_guard_appointment();

CREATE OR REPLACE FUNCTION public.equipe_book(p jsonb, ip_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid; pipe_id uuid; stage_id uuid; lead_id_new uuid;
  slot timestamptz; civil timestamp; prior leads%ROWTYPE;
BEGIN
  SELECT id INTO STRICT owner_id FROM buyers WHERE email='regiane@myhomefirst.us' FOR UPDATE;
  -- One transaction includes the abuse check and all four records. A timeout
  -- retried with the same request ID returns the same success, without sending.
  SELECT * INTO prior FROM leads WHERE raw_data->>'source'='landing_equipe' AND raw_data->>'requestId'=p->>'requestId' LIMIT 1;
  IF FOUND THEN
    IF prior.email=p->>'email' AND prior.phone=p->>'telefone' AND prior.raw_data->>'slot'=p->>'slot' THEN
      RETURN jsonb_build_object('ok',true,'slot',prior.raw_data->>'slot');
    END IF;
    RAISE EXCEPTION 'invalid';
  END IF;
  slot := (p->>'slot')::timestamptz;
  civil := slot AT TIME ZONE 'America/Sao_Paulo';
  IF slot IS NULL OR slot < now()+interval '4 hours' OR slot > now()+interval '30 days'
    OR extract(isodow FROM civil)>5 OR extract(second FROM civil)<>0 OR extract(minute FROM civil) NOT IN (0,30)
    OR NOT (extract(hour FROM civil) BETWEEN 9 AND 11 OR extract(hour FROM civil) BETWEEN 13 AND 16)
    OR length(COALESCE(p->>'nome','')) NOT BETWEEN 2 AND 120
    OR length(COALESCE(p->>'email','')) NOT BETWEEN 3 AND 254
    OR COALESCE(p->>'telefone','') !~ '^\+[1-9][0-9]{7,14}$'
    OR COALESCE(p->>'idioma','') NOT IN ('en','pt','es')
    OR COALESCE(p->>'requestId','') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    OR length(COALESCE(ip_hash,''))=0 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF EXISTS (SELECT 1 FROM appointments WHERE buyer_id=owner_id AND status IN ('scheduled','confirmed')
    AND scheduled_at>slot-interval '30 minutes' AND scheduled_at<slot+interval '30 minutes') THEN RAISE EXCEPTION 'slot_taken'; END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE raw_data->>'source'='landing_equipe' AND created_at>now()-interval '24 hours'
    AND (email=p->>'email' OR phone=p->>'telefone'))
    OR (SELECT count(*) FROM leads WHERE raw_data->>'source'='landing_equipe' AND created_at>now()-interval '24 hours' AND raw_data->>'ip_hash'=ip_hash)>=5
    OR (SELECT count(*) FROM leads WHERE raw_data->>'source'='landing_equipe' AND created_at>now()-interval '1 hour')>=40
    THEN RAISE EXCEPTION 'rate_limited'; END IF;
  SELECT id INTO pipe_id FROM pipelines WHERE buyer_id=owner_id AND is_default=true;
  SELECT id INTO stage_id FROM pipeline_stages WHERE pipeline_id=pipe_id ORDER BY position,id LIMIT 1;
  IF pipe_id IS NULL OR stage_id IS NULL THEN RAISE EXCEPTION 'unavailable'; END IF;
  INSERT INTO leads(name,email,phone,interest,campaign_name,form_name,type,status,product_type,assigned_to,assigned_at,raw_data)
  VALUES(p->>'nome',p->>'email',p->>'telefone','Recrutamento de agentes','Recrutamento — Landing Equipe','recrutamento_equipe','hot','appointment_set','lead',owner_id,now(),
    jsonb_build_object('source','landing_equipe','idioma',p->>'idioma','fuso',p->>'fuso','slot',p->>'slot','requestId',p->>'requestId','tracking',p->'tracking','ip_hash',ip_hash)) RETURNING id INTO lead_id_new;
  INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status,qualification_notes)
    VALUES(lead_id_new,owner_id,slot,'scheduled','Recrutamento /equipe · ' || (p->>'idioma') || ' · ' || (p->>'fuso'));
  INSERT INTO pipeline_leads(lead_id,pipeline_id,stage_id,position,moved_at) VALUES(lead_id_new,pipe_id,stage_id,0,now());
  INSERT INTO follow_ups(lead_id,buyer_id,type,description,scheduled_at)
    VALUES(lead_id_new,owner_id,'meeting','Recrutamento /equipe · ' || (p->>'slot') || ' · Fuso: ' || (p->>'fuso') || ' · Idioma: ' || (p->>'idioma'),NULL);
  RETURN jsonb_build_object('ok',true,'slot',p->>'slot');
END $$;
REVOKE ALL ON FUNCTION public.equipe_book(jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipe_book(jsonb,text) TO service_role;
COMMIT;
