-- Migration 005: Annual plans + Tags + Automations + Leaderboard + Referral
-- Apply via Supabase SQL editor

-- ============================================================================
-- ANNUAL PLANS
-- ============================================================================
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS crm_billing_interval TEXT DEFAULT 'month' CHECK (crm_billing_interval IN ('month', 'year'));

-- ============================================================================
-- TAGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (buyer_id, name)
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tags_owner_all ON tags;
CREATE POLICY tags_owner_all ON tags FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS lead_tags_owner_all ON lead_tags;
CREATE POLICY lead_tags_owner_all ON lead_tags FOR ALL USING (
  lead_id IN (SELECT id FROM leads WHERE buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()))
);

-- ============================================================================
-- AUTOMATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('stage_entered', 'stage_stale', 'no_response')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL CHECK (action_type IN ('send_template', 'move_stage', 'notify_agent')),
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pipeline_lead_id UUID REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error TEXT,
  ran_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (automation_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_automations_buyer ON automations(buyer_id) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_automation_runs_lead ON automation_runs(lead_id);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automations_owner_all ON automations;
CREATE POLICY automations_owner_all ON automations FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS automation_runs_owner_read ON automation_runs;
CREATE POLICY automation_runs_owner_read ON automation_runs FOR SELECT USING (
  automation_id IN (SELECT id FROM automations WHERE buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()))
);

-- ============================================================================
-- REFERRAL
-- ============================================================================
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS referral_credit_cents INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  referred_buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('signup', 'first_purchase', 'crm_subscription')),
  reward_cents INTEGER NOT NULL DEFAULT 0,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (referred_buyer_id, trigger_event)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_buyer_id);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_rewards_owner_read ON referral_rewards;
CREATE POLICY referral_rewards_owner_read ON referral_rewards FOR SELECT USING (
  referrer_buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Backfill referral codes for existing buyers (random 8-char base36)
UPDATE buyers SET referral_code = LOWER(SUBSTRING(MD5(id::text || RANDOM()::text), 1, 8))
WHERE referral_code IS NULL;

-- ============================================================================
-- DONE
-- ============================================================================
