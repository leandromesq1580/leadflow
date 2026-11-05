-- SMS pós-ligação personalizável por comprador (05/11/2026).
-- 1) sms_templates: modelos de texto do comprador (1 padrão no máximo).
-- 2) sms_call_choices: escolha feita no softphone para a ligação em curso (padrão | não enviar | modelo).
-- 3) buyers.sms_auto_enabled: chave geral. DEFAULT true = ninguém muda de comportamento até mexer.
-- Nada aqui envia SMS. Janela 8h–21h, 1/dia, 14 no total e STOP continuam valendo (lib/sms-auto.ts).
-- Acesso só pelo service_role (rotas autenticadas) — RLS ligada, sem policy.
BEGIN;

ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS sms_auto_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 320),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_templates_buyer ON public.sms_templates(buyer_id);
CREATE UNIQUE INDEX sms_templates_one_default ON public.sms_templates(buyer_id) WHERE is_default;

CREATE TABLE public.sms_call_choices (
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('default','off','template')),
  template_id uuid REFERENCES public.sms_templates(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (buyer_id, lead_id)
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_call_choices ENABLE ROW LEVEL SECURITY;

COMMIT;
