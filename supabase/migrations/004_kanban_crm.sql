-- Lead4Producers: Kanban CRM — pipelines, stages, follow-ups

-- 1. Pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipelines_buyer ON pipelines(buyer_id);

-- 2. Pipeline Stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);

-- 3. Pipeline Leads (lead ↔ stage binding)
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  position INT DEFAULT 0,
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, pipeline_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_pipeline ON pipeline_leads(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_stage ON pipeline_leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_lead ON pipeline_leads(lead_id);

-- 4. Follow-ups
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  type TEXT NOT NULL DEFAULT 'note',
  description TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON follow_ups(lead_id);

-- 5. Extra CRM fields on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS age_range TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_organic BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contract_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS policy_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attendant TEXT;

-- 6. RLS
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_own_pipelines" ON pipelines FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

CREATE POLICY "buyers_own_stages" ON pipeline_stages FOR ALL USING (
  pipeline_id IN (SELECT id FROM pipelines WHERE buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

CREATE POLICY "buyers_own_pipeline_leads" ON pipeline_leads FOR ALL USING (
  pipeline_id IN (SELECT id FROM pipelines WHERE buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

CREATE POLICY "buyers_own_follow_ups" ON follow_ups FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);
