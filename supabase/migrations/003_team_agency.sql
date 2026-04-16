-- Lead4Producers: Team/Agency Mode
-- Agency owners can buy leads and redistribute to their team members

-- 1. Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  auth_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_members_buyer ON team_members(buyer_id);
CREATE INDEX IF NOT EXISTS idx_team_members_auth ON team_members(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 2. Add agency columns to buyers
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS is_agency BOOLEAN DEFAULT FALSE;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS team_distribution_mode TEXT DEFAULT 'manual';

-- 3. Add team member assignment to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_member UUID REFERENCES team_members(id);
CREATE INDEX IF NOT EXISTS idx_leads_member ON leads(assigned_to_member) WHERE assigned_to_member IS NOT NULL;

-- 4. RLS for team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can read own team" ON team_members
  FOR SELECT USING (
    buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
  );

CREATE POLICY "Buyers can manage own team" ON team_members
  FOR ALL USING (
    buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
  );
