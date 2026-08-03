-- ============================================
-- 036: GESTÃO DE APÓLICES (pós-venda) — 2026-08-03
-- Traz pro Lead4Pro o modelo do "Status do Book": a apólice vendida vira um item
-- gerenciável, classificado em buckets de AÇÃO (urgente / assinatura / não processada
-- / acompanhar / em dia) calculados a partir de datas e pendências.
-- ============================================

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,   -- vínculo com o lead que virou cliente

  -- cliente
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,

  -- apólice
  policy_number TEXT,
  carrier TEXT,                    -- National Life, Mutual of Omaha…
  product TEXT,                    -- FlexLife IUL, Term, LSW 20-G…
  coverage_cents BIGINT,           -- face amount
  premium_cents BIGINT,            -- prêmio mensal
  premium_mode TEXT DEFAULT 'monthly',  -- monthly | annual

  -- ciclo de vida
  status TEXT NOT NULL DEFAULT 'submitted',
  -- submitted (enviada, aguardando a seguradora) | issued (emitida, aguardando assinatura/1º prêmio)
  -- active (em vigor) | at_risk (aviso de lapse) | lapsed (caducada) | cancelled | declined
  submitted_at DATE,               -- enviada no eApp
  issued_at DATE,                  -- emitida
  effective_date DATE,             -- vigente desde
  paid_through DATE,               -- pago até

  -- pendências e cobrança
  requirements TEXT[],             -- ['eDelivery','Policy Receipt','Amendment','ID Verification']
  amount_due_cents BIGINT,         -- dívida do aviso de lapse
  due_date DATE,                   -- prazo do aviso

  -- gestão
  next_action TEXT,                -- o que fazer
  notes TEXT,                      -- histórico/leitura do caso
  beneficiary TEXT,
  last_contact_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,             -- ação marcada como concluída
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_buyer ON policies (buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_lead ON policies (lead_id);
CREATE INDEX IF NOT EXISTS idx_policies_due ON policies (due_date) WHERE due_date IS NOT NULL;

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
