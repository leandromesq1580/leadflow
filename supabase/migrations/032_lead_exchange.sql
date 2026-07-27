-- ============================================
-- 032: TROCA DE LEADS (decisão 2026-07-25)
-- Lead trabalhado 14 dias (≥8 dias com tentativa: ligação/SMS) sem NENHUMA resposta
-- vira elegível pra troca. Aprovada: +1 crédito ao comprador e o lead vira FRIO
-- (volta pro estoque). Teto: trocas aprovadas+pendentes ≤ 30% dos leads PAGOS.
-- ============================================

CREATE TABLE IF NOT EXISTS lead_exchange_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  evidence JSONB,                          -- dossiê congelado no momento do pedido
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  UNIQUE (lead_id)                         -- 1 pedido por lead (re-pedir = admin decide de novo)
);

CREATE INDEX IF NOT EXISTS idx_lead_exchange_buyer ON lead_exchange_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_lead_exchange_status ON lead_exchange_requests(status);

-- RLS ligado sem policies = só service role (todas as APIs passam pelo servidor)
ALTER TABLE lead_exchange_requests ENABLE ROW LEVEL SECURITY;
