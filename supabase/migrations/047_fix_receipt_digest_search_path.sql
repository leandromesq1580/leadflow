-- 047 — Entrega de lead pago voltou a falhar: "function digest(text, unknown) does not exist"
--
-- CAUSA (reproduzida em 08/09/2026 nos logs de produção): a trigger
-- capture_lead_delivery_receipt (migration 045) chama digest(), do pgcrypto, sem
-- qualificar o schema. No Supabase o pgcrypto vive em `extensions`, e a entrega paga
-- roda dentro de assign_paid_lead_with_credit (046), que é SECURITY DEFINER
-- SET search_path = public — ou seja, `extensions` fica fora do caminho e a função
-- não é encontrada. Resultado: o UPDATE em leads aborta, a RPC devolve erro e o lead
-- NÃO é entregue (fica pendente e o poll tenta de novo a cada 2 min, sempre falhando).
-- Entregas por outros caminhos (update direto) funcionavam, porque o role tem
-- `extensions` no search_path — daí a falha ser intermitente e silenciosa na tela.
--
-- CORREÇÃO: usar sha256() do core do Postgres (pg_catalog, sempre no search_path),
-- em vez de digest() do pgcrypto. Mesmo hash, mesma saída hex — nenhum dado muda.

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
    -- sha256() nativo: não depende de pgcrypto nem do search_path da função chamadora
    encode(sha256(convert_to(v_email || '|' || regexp_replace(v_phone, '[^0-9]', '', 'g'), 'UTF8')), 'hex')
  );
  RETURN NEW;
END;
$$;

-- A trigger continua a mesma; só o corpo da função mudou.
CREATE OR REPLACE TRIGGER trg_capture_lead_delivery
AFTER INSERT OR UPDATE OF assigned_to, assigned_at ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.capture_lead_delivery_receipt();
