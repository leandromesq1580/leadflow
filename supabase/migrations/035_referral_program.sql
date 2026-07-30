-- ============================================
-- 035: PROGRAMA DE INDICAÇÃO — regra justa (decisão 2026-07-30)
-- Recompensa 10% do 1º pagamento do indicado (CRM) / 5% (pacotes de leads),
-- crédito PENDENTE por 14 dias (janela de cancelamento/chargeback), usado como
-- DESCONTO em compra de leads (até 50% do pedido), teto de $300/mês por indicador.
-- ============================================

-- Carência + ciclo de vida da recompensa
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS note TEXT;

-- trigger_event ganha 'lead_purchase' (compra de pacote de leads pelo indicado)
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_trigger_event_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_trigger_event_check
  CHECK (trigger_event IN ('signup', 'first_purchase', 'crm_subscription', 'lead_purchase'));

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards (status, available_at);

-- Resgates (uso do crédito como desconto) — trilha de auditoria
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_buyer ON referral_redemptions (buyer_id);
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
