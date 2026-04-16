-- Lead4Producers Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BUYERS (compradores / agentes de seguro)
-- ============================================
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  stripe_customer_id TEXT,
  cal_link TEXT,
  notification_email BOOLEAN DEFAULT TRUE,
  notification_sms BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CREDITS (saldo de leads/appointments)
-- ============================================
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lead', 'appointment')),
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_used INTEGER NOT NULL DEFAULT 0,
  price_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_payment_id TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEADS (leads recebidos do Meta)
-- ============================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meta_lead_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  city TEXT,
  state TEXT,
  interest TEXT DEFAULT 'Seguro de vida',
  campaign_name TEXT,
  form_name TEXT,
  raw_data JSONB,
  type TEXT NOT NULL DEFAULT 'hot' CHECK (type IN ('hot', 'cold')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'qualified', 'appointment_set')),
  assigned_to UUID REFERENCES buyers(id),
  assigned_at TIMESTAMPTZ,
  product_type TEXT NOT NULL DEFAULT 'lead' CHECK (product_type IN ('lead', 'appointment')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPOINTMENTS
-- ============================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  cal_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled')),
  qualification_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEAD ACTIVITY (historico de contato)
-- ============================================
CREATE TABLE lead_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  action TEXT NOT NULL CHECK (action IN ('contacted', 'no_answer', 'callback', 'meeting_set', 'converted', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('lead', 'appointment')),
  quantity INTEGER NOT NULL,
  price_per_unit NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SETTINGS (admin config)
-- ============================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('pricing', '{"lead_exclusive": 22, "appointment": 38}'),
  ('distribution', '{"auto_distribute": true, "max_buyers_per_lead": 1}'),
  ('notifications', '{"email_enabled": true, "sms_enabled": false}'),
  ('meta_webhook', '{"verify_token": "", "connected": false}');

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_product_type ON leads(product_type);
CREATE INDEX idx_credits_buyer_id ON credits(buyer_id);
CREATE INDEX idx_credits_type ON credits(type);
CREATE INDEX idx_appointments_buyer_id ON appointments(buyer_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_lead_activity_lead_id ON lead_activity(lead_id);
CREATE INDEX idx_payments_buyer_id ON payments(buyer_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get eligible buyers for lead distribution (round-robin)
CREATE OR REPLACE FUNCTION get_eligible_buyers(p_product_type TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  notification_email BOOLEAN,
  notification_sms BOOLEAN,
  leads_count BIGINT,
  credit_id UUID,
  remaining BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.email,
    b.phone,
    b.notification_email,
    b.notification_sms,
    COALESCE(lc.cnt, 0) AS leads_count,
    c.id AS credit_id,
    (c.total_purchased - c.total_used)::BIGINT AS remaining
  FROM buyers b
  INNER JOIN credits c ON c.buyer_id = b.id AND c.type = p_product_type
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM leads l
    WHERE l.assigned_to = b.id
      AND l.created_at >= NOW() - INTERVAL '30 days'
  ) lc ON TRUE
  WHERE b.is_active = TRUE
    AND (c.total_purchased - c.total_used) > 0
    AND (c.expires_at IS NULL OR c.expires_at > NOW())
  ORDER BY lc.cnt ASC, c.purchased_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_buyers_updated_at BEFORE UPDATE ON buyers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Buyers can read their own data
CREATE POLICY "buyers_read_own" ON buyers FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "buyers_update_own" ON buyers FOR UPDATE USING (auth.uid() = auth_user_id);

-- Admin can read all buyers
CREATE POLICY "admin_read_all_buyers" ON buyers FOR SELECT USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);
CREATE POLICY "admin_manage_buyers" ON buyers FOR ALL USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

-- Buyers can read their own credits
CREATE POLICY "credits_read_own" ON credits FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Buyers can read their own leads
CREATE POLICY "leads_read_own" ON leads FOR SELECT USING (
  assigned_to IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Admin can read all leads
CREATE POLICY "admin_read_all_leads" ON leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);
CREATE POLICY "admin_manage_leads" ON leads FOR ALL USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

-- Buyers can read their own appointments
CREATE POLICY "appointments_read_own" ON appointments FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Buyers can read and create their own activity
CREATE POLICY "activity_read_own" ON lead_activity FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);
CREATE POLICY "activity_create_own" ON lead_activity FOR INSERT WITH CHECK (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Buyers can read their own payments
CREATE POLICY "payments_read_own" ON payments FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

-- Settings: admin only
CREATE POLICY "settings_admin_only" ON settings FOR ALL USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

-- Service role bypasses RLS (for webhooks, distribution)
