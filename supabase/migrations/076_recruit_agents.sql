-- Recrutamento de agentes recém-licenciados (fonte: Florida DFS). Separado das campanhas de leads:
-- ninguém aqui é lead nem cliente. Esta migration NÃO envia e-mail e NÃO altera nenhuma tabela existente.
-- Tudo é acessado só pelo service_role (rotas /api/admin/*, que checam is_admin) — RLS ligada, sem policy.
BEGIN;

CREATE TABLE public.recruit_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  license text NOT NULL DEFAULT '',
  npn text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','pt','es')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','replied','interested','joined','declined')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  source text NOT NULL DEFAULT 'fl_dfs',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status_updated_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE INDEX recruit_agents_status ON public.recruit_agents(status);
CREATE INDEX recruit_agents_state ON public.recruit_agents(state);

CREATE TABLE public.recruit_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  subject_en text NOT NULL CHECK (length(subject_en) BETWEEN 1 AND 160),
  body_en text NOT NULL CHECK (length(body_en) BETWEEN 1 AND 20000),
  subject_pt text NOT NULL CHECK (length(subject_pt) BETWEEN 1 AND 160),
  body_pt text NOT NULL CHECK (length(body_pt) BETWEEN 1 AND 20000),
  subject_es text NOT NULL CHECK (length(subject_es) BETWEEN 1 AND 160),
  body_es text NOT NULL CHECK (length(body_es) BETWEEN 1 AND 20000),
  filters jsonb NOT NULL DEFAULT '{}',
  daily_limit integer NOT NULL DEFAULT 200 CHECK (daily_limit BETWEEN 1 AND 1000),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','scheduled','running','paused','cancelled','completed')),
  scheduled_at timestamptz,
  scheduled_by uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  audience_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recruit_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.recruit_campaigns(id),
  agent_id uuid NOT NULL REFERENCES public.recruit_agents(id),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  language text NOT NULL CHECK (language IN ('en','pt','es')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','reserved','sending','accepted','delivered','bounced','complained','refused','unknown','suppressed','cancelled')),
  reason text,
  lease uuid, lease_until timestamptz,
  started_at timestamptz, accepted_at timestamptz, delivered_at timestamptz, opened_at timestamptz, clicked_at timestamptz,
  provider_id text UNIQUE,
  UNIQUE (campaign_id, email)
);
CREATE INDEX recruit_sends_pending ON public.recruit_sends(campaign_id, id) WHERE state = 'pending';
CREATE INDEX recruit_sends_agent ON public.recruit_sends(agent_id);

ALTER TABLE public.recruit_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruit_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruit_agents, public.recruit_campaigns, public.recruit_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recruit_agents, public.recruit_campaigns, public.recruit_sends TO service_role;

-- Importa/atualiza agentes pelo e-mail. NUNCA mexe em status, idioma, notas nem descadastro de quem já existe.
CREATE FUNCTION public.rc_import(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ins integer; tot integer;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 3000 THEN RAISE EXCEPTION 'invalid_rows'; END IF;
  tot := jsonb_array_length(p_rows);
  WITH src AS (
    SELECT DISTINCT ON (lower(btrim(x->>'email')))
      lower(btrim(x->>'email')) email, left(coalesce(x->>'name',''),200) name, left(coalesce(x->>'phone',''),40) phone,
      left(coalesce(x->>'address',''),200) address, left(coalesce(x->>'city',''),100) city, left(coalesce(x->>'state',''),20) state,
      left(coalesce(x->>'zip',''),20) zip, left(coalesce(x->>'county',''),100) county, left(coalesce(x->>'license',''),40) license,
      left(coalesce(x->>'npn',''),40) npn, CASE WHEN x->>'language' IN ('en','pt','es') THEN x->>'language' ELSE 'en' END language
    FROM jsonb_array_elements(p_rows) x
    WHERE lower(btrim(coalesce(x->>'email',''))) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' AND length(x->>'email') <= 254
  ), up AS (
    INSERT INTO public.recruit_agents(email,name,phone,address,city,state,zip,county,license,npn,language)
    SELECT email,name,phone,address,city,state,zip,county,license,npn,language FROM src
    ON CONFLICT (email) DO UPDATE SET name=excluded.name, phone=excluded.phone, address=excluded.address, city=excluded.city,
      state=excluded.state, zip=excluded.zip, county=excluded.county, license=excluded.license, npn=excluded.npn, last_seen_at=now()
    RETURNING (xmax = 0) AS inserted
  ) SELECT count(*) FILTER (WHERE inserted) INTO ins FROM up;
  RETURN jsonb_build_object('received', tot, 'inserted', ins, 'agents', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'email', a.email, 'status', a.status, 'language', a.language, 'notes', a.notes, 'suppressed', a.suppressed_at IS NOT NULL))
    FROM public.recruit_agents a WHERE a.email IN (SELECT lower(btrim(x->>'email')) FROM jsonb_array_elements(p_rows) x)), '[]'::jsonb));
END $$;

-- Quem pode receber: não descadastrado, não é cliente (buyers) e passa nos filtros.
-- filters: {languages:[en|pt|es], states:[UF], statuses:[...] (padrão: ["new"])}
CREATE FUNCTION public.rc_rows(p_filters jsonb) RETURNS TABLE(agent_id uuid, email text, name text, language text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.email, a.name, a.language,
    CASE WHEN a.suppressed_at IS NOT NULL THEN 'suppressed'
         WHEN EXISTS (SELECT 1 FROM public.buyers b WHERE lower(btrim(b.email)) = a.email) THEN 'already_client'
         ELSE NULL END
  FROM public.recruit_agents a
  WHERE (NOT p_filters ? 'languages' OR jsonb_array_length(p_filters->'languages') = 0 OR a.language IN (SELECT jsonb_array_elements_text(p_filters->'languages')))
    AND (NOT p_filters ? 'states' OR jsonb_array_length(p_filters->'states') = 0 OR a.state IN (SELECT jsonb_array_elements_text(p_filters->'states')))
    AND a.status IN (SELECT jsonb_array_elements_text(CASE WHEN p_filters ? 'statuses' AND jsonb_array_length(p_filters->'statuses') > 0 THEN p_filters->'statuses' ELSE '["new"]'::jsonb END))
$$;

CREATE FUNCTION public.rc_audience(p_filters jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'selected', count(*), 'eligible', count(*) FILTER (WHERE reason IS NULL),
    'en', count(*) FILTER (WHERE reason IS NULL AND language='en'), 'pt', count(*) FILTER (WHERE reason IS NULL AND language='pt'),
    'es', count(*) FILTER (WHERE reason IS NULL AND language='es'),
    'suppressed', count(*) FILTER (WHERE reason='suppressed'), 'already_client', count(*) FILTER (WHERE reason='already_client'))
  FROM public.rc_rows(p_filters)
$$;

-- Congela o público (o que o admin viu é o que será enviado) e agenda. Só rascunho.
CREATE FUNCTION public.rc_schedule(p_actor uuid, p_id uuid, p_at timestamptz, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.recruit_campaigns; a jsonb; n integer;
BEGIN
  SELECT * INTO c FROM public.recruit_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF c.state <> 'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
  IF p_at IS NULL OR p_at > now() + interval '366 days' THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
  a := public.rc_audience(c.filters);
  IF (a->>'eligible')::int = 0 THEN RAISE EXCEPTION 'empty_audience'; END IF;
  INSERT INTO public.recruit_sends(campaign_id, agent_id, email, name, language)
    SELECT c.id, agent_id, email, name, language FROM public.rc_rows(c.filters) WHERE reason IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> (a->>'eligible')::int OR n <> p_expected THEN RAISE EXCEPTION 'audience_changed'; END IF;
  UPDATE public.recruit_campaigns SET state='scheduled', scheduled_at=greatest(p_at, now()), scheduled_by=p_actor, audience_snapshot=a, updated_at=now()
    WHERE id = c.id RETURNING * INTO c;
  RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.rc_control(p_id uuid, p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.recruit_campaigns;
BEGIN
  SELECT * INTO c FROM public.recruit_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF p_action = 'pause' AND c.state IN ('scheduled','running') THEN c.state := 'paused';
  ELSIF p_action = 'resume' AND c.state = 'paused' THEN c.state := 'scheduled';
  ELSIF p_action = 'cancel' AND c.state IN ('draft','scheduled','running','paused') THEN
    c.state := 'cancelled';
    UPDATE public.recruit_sends SET state='cancelled', reason='campaign_cancelled', lease=NULL, lease_until=NULL WHERE campaign_id = c.id AND state IN ('pending','reserved');
  ELSE RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE public.recruit_campaigns SET state = c.state, updated_at = now() WHERE id = c.id;
  RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.rc_complete(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.recruit_campaigns SET state='completed', updated_at=now() WHERE id = p_id AND state IN ('scheduled','running')
    AND NOT EXISTS (SELECT 1 FROM public.recruit_sends WHERE campaign_id = p_id AND state IN ('pending','reserved','sending'))
$$;

-- Reserva UM destinatário por chamada. Limite por campanha/dia (UTC) e 10 por minuto no total. Timeout de envio vira
-- 'unknown' e NUNCA é reenviado automaticamente.
CREATE FUNCTION public.rc_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.recruit_campaigns; r public.recruit_sends; t timestamptz := clock_timestamp(); used_day integer; used_min integer;
BEGIN
  PERFORM pg_advisory_xact_lock(7600076);
  t := clock_timestamp();
  UPDATE public.recruit_sends SET state='unknown', reason='worker_interrupted' WHERE state='sending' AND lease_until < t;
  UPDATE public.recruit_sends s SET state = CASE WHEN c0.state='cancelled' THEN 'cancelled' ELSE 'pending' END, lease=NULL, lease_until=NULL
    FROM public.recruit_campaigns c0 WHERE s.campaign_id=c0.id AND s.state='reserved' AND s.lease_until < t;
  UPDATE public.recruit_sends s SET state='suppressed', reason='unsubscribed'
    FROM public.recruit_agents a WHERE s.agent_id=a.id AND s.state='pending' AND a.suppressed_at IS NOT NULL;
  FOR c IN SELECT * FROM public.recruit_campaigns WHERE state IN ('scheduled','running') LOOP
    PERFORM public.rc_complete(c.id);
  END LOOP;
  SELECT count(*) INTO used_min FROM public.recruit_sends WHERE started_at >= date_trunc('minute', t);
  IF used_min >= 10 THEN RETURN NULL; END IF;
  FOR c IN SELECT * FROM public.recruit_campaigns WHERE state IN ('scheduled','running') AND scheduled_at <= t
           AND EXISTS (SELECT 1 FROM public.recruit_sends x WHERE x.campaign_id = recruit_campaigns.id AND x.state='pending')
           ORDER BY scheduled_at, id LOOP
    SELECT count(*) INTO used_day FROM public.recruit_sends WHERE campaign_id = c.id AND started_at >= (t AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC';
    IF used_day >= c.daily_limit THEN CONTINUE; END IF;
    SELECT * INTO r FROM public.recruit_sends WHERE campaign_id = c.id AND state='pending' ORDER BY id LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE public.recruit_sends SET state='reserved', lease=gen_random_uuid(), lease_until=t + interval '5 minutes', started_at=t WHERE id = r.id RETURNING * INTO r;
    UPDATE public.recruit_campaigns SET state='running', updated_at=t WHERE id = c.id;
    RETURN to_jsonb(r) || jsonb_build_object('campaign', to_jsonb(c), 'unsubscribe_token', (SELECT unsubscribe_token FROM public.recruit_agents WHERE id = r.agent_id));
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION public.rc_authorize(p_id uuid, p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.recruit_sends; c public.recruit_campaigns; a public.recruit_agents;
BEGIN
  SELECT c0.* INTO c FROM public.recruit_campaigns c0 JOIN public.recruit_sends r0 ON r0.campaign_id = c0.id WHERE r0.id = p_id FOR UPDATE OF c0;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO r FROM public.recruit_sends WHERE id = p_id FOR UPDATE;
  IF r.lease IS DISTINCT FROM p_lease OR r.state <> 'reserved' OR r.lease_until < clock_timestamp() THEN RETURN false; END IF;
  IF c.state NOT IN ('scheduled','running') THEN
    UPDATE public.recruit_sends SET state = CASE WHEN c.state='cancelled' THEN 'cancelled' ELSE 'pending' END, lease=NULL, lease_until=NULL WHERE id = r.id;
    RETURN false;
  END IF;
  SELECT * INTO a FROM public.recruit_agents WHERE id = r.agent_id FOR UPDATE;
  IF a.suppressed_at IS NOT NULL OR a.status = 'declined' OR a.email <> r.email THEN
    UPDATE public.recruit_sends SET state='suppressed', reason='unsubscribed_or_declined' WHERE id = r.id;
    RETURN false;
  END IF;
  UPDATE public.recruit_sends SET state='sending', lease_until = clock_timestamp() + interval '5 minutes' WHERE id = r.id;
  RETURN true;
END $$;

CREATE FUNCTION public.rc_finish(p_id uuid, p_lease uuid, p_state text, p_provider text, p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.recruit_sends;
BEGIN
  IF p_state NOT IN ('accepted','refused','unknown') THEN RAISE EXCEPTION 'invalid_result'; END IF;
  IF p_state = 'accepted' AND coalesce(p_provider,'') = '' THEN RAISE EXCEPTION 'provider_id_required'; END IF;
  SELECT * INTO r FROM public.recruit_sends WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.lease IS DISTINCT FROM p_lease OR r.state NOT IN ('sending','unknown') THEN RETURN false; END IF;
  UPDATE public.recruit_sends SET state=p_state, provider_id=p_provider, reason=left(p_reason,100),
    accepted_at = CASE WHEN p_state='accepted' THEN now() ELSE NULL END, lease=NULL, lease_until=NULL WHERE id = p_id;
  IF p_state = 'accepted' THEN
    UPDATE public.recruit_agents SET status='contacted', status_updated_at=now() WHERE id = r.agent_id AND status='new';
  END IF;
  PERFORM public.rc_complete(r.campaign_id);
  RETURN true;
END $$;

CREATE FUNCTION public.rc_unsubscribe(p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE public.recruit_agents SET suppressed_at = coalesce(suppressed_at, now()), suppression_reason = coalesce(suppression_reason, 'unsubscribe') WHERE unsubscribe_token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- Retorno do provedor (Resend): entrega/abertura/clique; bounce/denúncia descadastra o agente.
CREATE FUNCTION public.rc_event(p_provider text, p_kind text, p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.recruit_sends;
BEGIN
  SELECT * INTO r FROM public.recruit_sends WHERE provider_id = p_provider FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_kind = 'email.delivered' THEN
    UPDATE public.recruit_sends SET delivered_at = coalesce(delivered_at, p_at), state = CASE WHEN state='accepted' THEN 'delivered' ELSE state END WHERE id = r.id;
  ELSIF p_kind = 'email.opened' THEN UPDATE public.recruit_sends SET opened_at = coalesce(opened_at, p_at) WHERE id = r.id;
  ELSIF p_kind = 'email.clicked' THEN UPDATE public.recruit_sends SET clicked_at = coalesce(clicked_at, p_at) WHERE id = r.id;
  ELSIF p_kind IN ('email.bounced','email.complained','email.failed','email.suppressed') THEN
    UPDATE public.recruit_sends SET state = CASE p_kind WHEN 'email.complained' THEN 'complained' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.suppressed' THEN 'suppressed' ELSE 'refused' END WHERE id = r.id;
    IF p_kind IN ('email.bounced','email.complained','email.suppressed') THEN
      UPDATE public.recruit_agents SET suppressed_at = coalesce(suppressed_at, now()), suppression_reason = coalesce(suppression_reason, replace(p_kind,'email.','')) WHERE id = r.agent_id;
    END IF;
  ELSE RETURN false; END IF;
  RETURN true;
END $$;

-- Lista de campanhas (sem os textos) com números de envio.
CREATE FUNCTION public.rc_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
    SELECT c.id, c.name, c.state, c.scheduled_at, c.daily_limit, c.filters, c.created_at,
      jsonb_build_object('total', count(s.id), 'pending', count(s.id) FILTER (WHERE s.state IN ('pending','reserved')),
        'accepted', count(s.accepted_at), 'delivered', count(s.delivered_at), 'opened', count(s.opened_at), 'clicked', count(s.clicked_at),
        'bounced', count(s.id) FILTER (WHERE s.state='bounced'), 'complained', count(s.id) FILTER (WHERE s.state='complained'),
        'refused', count(s.id) FILTER (WHERE s.state='refused'), 'unknown', count(s.id) FILTER (WHERE s.state='unknown'),
        'suppressed', count(s.id) FILTER (WHERE s.state='suppressed'), 'cancelled', count(s.id) FILTER (WHERE s.state='cancelled')) stats
    FROM public.recruit_campaigns c LEFT JOIN public.recruit_sends s ON s.campaign_id = c.id
    GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50) x
$$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('rc_import','rc_rows','rc_audience','rc_schedule','rc_control','rc_complete','rc_claim','rc_authorize','rc_finish','rc_unsubscribe','rc_event','rc_list') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;
COMMIT;
