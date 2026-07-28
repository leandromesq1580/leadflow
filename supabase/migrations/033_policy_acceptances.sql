-- ============================================
-- 033: ACEITE DE POLÍTICAS (clickwrap) — decisão 2026-07-28
-- Registro append-only de quem aceitou qual versão, quando e de onde.
-- Regra: SEM aceite da versão vigente = SEM compra (uso do CRM não trava).
-- ============================================

CREATE TABLE IF NOT EXISTS policy_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  context TEXT,                -- checkout_lead | checkout_crm | signup | manual
  ip TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (buyer_id, version)   -- 1 aceite por versão por conta (append-only entre versões)
);
CREATE INDEX IF NOT EXISTS idx_policy_acc_buyer ON policy_acceptances(buyer_id);

-- Cache pra gate rápido no checkout
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS accepted_policy_version TEXT;

-- RLS ligado sem policies = só service role (todo acesso passa pelo servidor)
ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;
