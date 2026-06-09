-- ============================================
-- 017: SMS em massa (Twilio) — campanhas, mensagens e opt-out
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  filters JSONB,
  total INT DEFAULT 0,
  sent INT DEFAULT 0,
  failed INT DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft | sending | done
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES sms_campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('out','in')),
  from_phone TEXT,
  to_phone TEXT,
  body TEXT,
  status TEXT DEFAULT 'queued', -- queued | sent | failed | received
  twilio_sid TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign ON sms_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_sid ON sms_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Opt-out (STOP) por lead — excluído de qualquer disparo futuro
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT FALSE;

-- RLS ligado sem policies = só service role acessa (admin APIs)
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
