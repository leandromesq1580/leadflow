-- 045: EVIDENCIAS DE COMPRA, ACESSO E ENTREGA PARA CONTESTACOES
-- Registros probatorios sao append-only: a aplicacao pode inserir, mas nunca
-- editar/apagar. Casos de disputa sao mutaveis porque o status vem da Stripe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.policy_versions (
  version TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  public_url TEXT NOT NULL,
  source_path TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.policy_versions (version, sha256, public_url, source_path, summary)
VALUES (
  '2026-09-07.1',
  'c179e400eceacc79dc31dec934f10d875380c7feeab5cc4e032b9bb1d13e35a9',
  'https://lead4producers.com/politicas',
  'src/components/localized-policy-page.tsx',
  jsonb_build_object(
    'languages', jsonb_build_array('pt', 'en', 'es'),
    'material_terms', jsonb_build_array(
      'paid_subscription_non_refundable_except_when_required_by_law',
      'automatic_renewal_until_cancelled',
      'crm_subscription_does_not_include_leads',
      'lead_exchange_only_for_invalid_or_nonexistent_phone_or_email',
      'lead_is_an_opportunity_not_a_guaranteed_sale'
    )
  )
)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.purchase_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.buyers(id),
  policy_acceptance_id UUID REFERENCES public.policy_acceptances(id),
  policy_version TEXT NOT NULL REFERENCES public.policy_versions(version),
  policy_sha256 TEXT NOT NULL,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  product_type TEXT NOT NULL,
  product_description TEXT,
  quantity INTEGER,
  lead_language TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  locale TEXT,
  stripe_terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  acceptance_ip TEXT,
  acceptance_user_agent TEXT,
  accepted_at TIMESTAMPTZ,
  checkout_completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchase_consents_buyer_idx ON public.purchase_consents (buyer_id, checkout_completed_at DESC);
CREATE INDEX IF NOT EXISTS purchase_consents_pi_idx ON public.purchase_consents (stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS public.platform_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.buyers(id),
  auth_user_id UUID,
  event_type TEXT NOT NULL DEFAULT 'page_view',
  path TEXT NOT NULL,
  locale TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_access_logs_buyer_idx ON public.platform_access_logs (buyer_id, occurred_at DESC);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS delivery_credit_id UUID REFERENCES public.credits(id);

CREATE TABLE IF NOT EXISTS public.lead_delivery_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  buyer_id UUID NOT NULL REFERENCES public.buyers(id),
  credit_id UUID REFERENCES public.credits(id),
  payment_id UUID REFERENCES public.payments(id),
  delivered_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'live_assignment',
  lead_language TEXT,
  state TEXT,
  campaign_name TEXT,
  form_name TEXT,
  meta_lead_id TEXT,
  lead_name TEXT,
  masked_phone TEXT,
  masked_email TEXT,
  contact_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_delivery_receipts_buyer_idx ON public.lead_delivery_receipts (buyer_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS lead_delivery_receipts_payment_idx ON public.lead_delivery_receipts (payment_id);
CREATE INDEX IF NOT EXISTS lead_delivery_receipts_lead_idx ON public.lead_delivery_receipts (lead_id, delivered_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_notification_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id),
  buyer_id UUID NOT NULL REFERENCES public.buyers(id),
  delivery_receipt_id UUID REFERENCES public.lead_delivery_receipts(id),
  channel TEXT NOT NULL DEFAULT 'configured_notifications',
  status TEXT NOT NULL DEFAULT 'completed',
  notified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lead_notification_receipts_buyer_idx ON public.lead_notification_receipts (buyer_id, notified_at DESC);

CREATE TABLE IF NOT EXISTS public.chargeback_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  buyer_id UUID REFERENCES public.buyers(id),
  payment_id UUID REFERENCES public.payments(id),
  reason TEXT,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  evidence_due_by TIMESTAMPTZ,
  evidence_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chargeback_cases_status_idx ON public.chargeback_cases (status, evidence_due_by);

CREATE TABLE IF NOT EXISTS public.chargeback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chargeback_case_id UUID NOT NULL REFERENCES public.chargeback_cases(id),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.block_evidence_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'evidence records are append-only';
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['policy_versions','purchase_consents','platform_access_logs','lead_delivery_receipts','lead_notification_receipts','chargeback_events']
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_evidence_mutation()', 'trg_' || t || '_immutable', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.capture_lead_delivery_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_payment_id UUID;
  v_credit_payment TEXT;
  v_phone TEXT := COALESCE(NEW.phone, '');
  v_email TEXT := COALESCE(LOWER(NEW.email), '');
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
     AND OLD.assigned_at IS NOT DISTINCT FROM NEW.assigned_at THEN RETURN NEW; END IF;

  IF NEW.delivery_credit_id IS NOT NULL THEN
    SELECT stripe_payment_id INTO v_credit_payment FROM public.credits WHERE id = NEW.delivery_credit_id;
    SELECT id INTO v_payment_id FROM public.payments
      WHERE buyer_id = NEW.assigned_to
        AND (stripe_session_id = v_credit_payment OR stripe_payment_intent_id = v_credit_payment)
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.lead_delivery_receipts (
    lead_id, buyer_id, credit_id, payment_id, delivered_at, lead_language,
    state, campaign_name, form_name, meta_lead_id, lead_name, masked_phone,
    masked_email, contact_sha256
  ) VALUES (
    NEW.id, NEW.assigned_to, NEW.delivery_credit_id, v_payment_id, NEW.assigned_at,
    NEW.lead_language, NEW.state, NEW.campaign_name, NEW.form_name, NEW.meta_lead_id,
    NEW.name,
    CASE WHEN length(v_phone) <= 4 THEN repeat('*', length(v_phone)) ELSE left(v_phone, 2) || repeat('*', greatest(length(v_phone)-4, 1)) || right(v_phone, 2) END,
    CASE WHEN position('@' IN v_email) > 1 THEN left(v_email, 1) || '***' || substring(v_email FROM position('@' IN v_email)) ELSE '***' END,
    encode(digest(v_email || '|' || regexp_replace(v_phone, '[^0-9]', '', 'g'), 'sha256'), 'hex')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_capture_lead_delivery
AFTER INSERT OR UPDATE OF assigned_to, assigned_at ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.capture_lead_delivery_receipt();

CREATE OR REPLACE FUNCTION public.capture_lead_notification_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_delivery UUID;
BEGIN
  IF NEW.notified_at IS NULL OR NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.notified_at IS NOT DISTINCT FROM NEW.notified_at THEN RETURN NEW; END IF;
  SELECT id INTO v_delivery FROM public.lead_delivery_receipts
    WHERE lead_id = NEW.id AND buyer_id = NEW.assigned_to ORDER BY delivered_at DESC LIMIT 1;
  INSERT INTO public.lead_notification_receipts (lead_id, buyer_id, delivery_receipt_id, notified_at)
  VALUES (NEW.id, NEW.assigned_to, v_delivery, NEW.notified_at);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_capture_lead_notification
AFTER INSERT OR UPDATE OF notified_at ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.capture_lead_notification_receipt();

-- Backfill honesto: comprova o estado historico encontrado no banco, sem fingir
-- que o trigger existia no momento original. SOURCE diferencia isso no dossie.
INSERT INTO public.lead_delivery_receipts (
  lead_id, buyer_id, delivered_at, source, lead_language, state, campaign_name,
  form_name, meta_lead_id, lead_name, masked_phone, masked_email, contact_sha256
)
SELECT l.id, l.assigned_to, COALESCE(l.assigned_at, l.created_at), 'legacy_backfill',
  l.lead_language, l.state, l.campaign_name, l.form_name, l.meta_lead_id, l.name,
  CASE WHEN length(COALESCE(l.phone,'')) <= 4 THEN repeat('*', length(COALESCE(l.phone,''))) ELSE left(l.phone,2) || repeat('*',greatest(length(l.phone)-4,1)) || right(l.phone,2) END,
  CASE WHEN position('@' IN COALESCE(LOWER(l.email),'')) > 1 THEN left(LOWER(l.email),1) || '***' || substring(LOWER(l.email) FROM position('@' IN LOWER(l.email))) ELSE '***' END,
  encode(digest(COALESCE(LOWER(l.email),'') || '|' || regexp_replace(COALESCE(l.phone,''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
FROM public.leads l
WHERE l.assigned_to IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lead_delivery_receipts r WHERE r.lead_id = l.id AND r.buyer_id = l.assigned_to);

INSERT INTO public.lead_notification_receipts (lead_id, buyer_id, delivery_receipt_id, notified_at)
SELECT l.id, l.assigned_to, r.id, l.notified_at
FROM public.leads l
JOIN LATERAL (
  SELECT id FROM public.lead_delivery_receipts d WHERE d.lead_id=l.id AND d.buyer_id=l.assigned_to ORDER BY delivered_at DESC LIMIT 1
) r ON TRUE
WHERE l.assigned_to IS NOT NULL AND l.notified_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lead_notification_receipts n WHERE n.lead_id=l.id AND n.notified_at=l.notified_at);

ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notification_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargeback_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargeback_events ENABLE ROW LEVEL SECURITY;
