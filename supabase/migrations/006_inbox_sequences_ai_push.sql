-- Migration 006: WhatsApp Inbox + Sequences + AI Scoring + Push
-- Apply via Supabase SQL editor

-- ============================================================================
-- WHATSAPP INBOX
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  wa_message_id TEXT UNIQUE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_lead ON whatsapp_messages(lead_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_buyer ON whatsapp_messages(buyer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_from ON whatsapp_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_wa_msg_unread ON whatsapp_messages(buyer_id) WHERE direction = 'in' AND read_at IS NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_msg_owner_all ON whatsapp_messages;
CREATE POLICY wa_msg_owner_all ON whatsapp_messages FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- ============================================================================
-- SEQUENCES (DRIP CAMPAIGNS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  trigger_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  custom_body TEXT,
  step_type TEXT NOT NULL DEFAULT 'send_template' CHECK (step_type IN ('send_template', 'wait', 'notify_agent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sequence_id, step_order)
);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  next_run_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'stopped')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (sequence_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_sequences_buyer ON sequences(buyer_id) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_seq_steps_seq ON sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_seq_enroll_due ON sequence_enrollments(next_run_at) WHERE status = 'active';

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sequences_owner_all ON sequences;
CREATE POLICY sequences_owner_all ON sequences FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS sequence_steps_owner_all ON sequence_steps;
CREATE POLICY sequence_steps_owner_all ON sequence_steps FOR ALL USING (
  sequence_id IN (SELECT id FROM sequences WHERE buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()))
);

DROP POLICY IF EXISTS seq_enroll_owner_all ON sequence_enrollments;
CREATE POLICY seq_enroll_owner_all ON sequence_enrollments FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- ============================================================================
-- AI LEAD SCORING
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score DESC) WHERE ai_score IS NOT NULL;

-- ============================================================================
-- PUSH NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_buyer ON push_subscriptions(buyer_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_owner_all ON push_subscriptions;
CREATE POLICY push_owner_all ON push_subscriptions FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- ============================================================================
-- DONE
-- ============================================================================
