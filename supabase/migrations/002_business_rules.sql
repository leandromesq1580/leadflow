-- Migration 002: Business Rules
-- 1. Buyer states (licenses)
-- 2. Buyer availability (appointments)
-- 3. Updated distribution function

-- ============================================
-- BUYER STATES (licenças por estado)
-- ============================================
CREATE TABLE buyer_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, state_code)
);

CREATE INDEX idx_buyer_states_buyer ON buyer_states(buyer_id);
CREATE INDEX idx_buyer_states_state ON buyer_states(state_code);

-- RLS
ALTER TABLE buyer_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buyer_states_read_own" ON buyer_states FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);
CREATE POLICY "buyer_states_admin" ON buyer_states FOR ALL USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

-- ============================================
-- BUYER AVAILABILITY (disponibilidade para appointments)
-- ============================================
CREATE TABLE buyer_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'saturday', 'sunday', 'holiday')),
  period TEXT NOT NULL CHECK (period IN ('morning', 'afternoon', 'evening')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, day_type, period)
);

CREATE INDEX idx_buyer_availability_buyer ON buyer_availability(buyer_id);

-- RLS
ALTER TABLE buyer_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buyer_availability_read_own" ON buyer_availability FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);
CREATE POLICY "buyer_availability_admin" ON buyer_availability FOR ALL USING (
  EXISTS (SELECT 1 FROM buyers WHERE auth_user_id = auth.uid() AND is_admin = TRUE)
);

-- ============================================
-- UPDATED: get_eligible_buyers with state filter + weighted distribution
-- ============================================
CREATE OR REPLACE FUNCTION get_eligible_buyers(p_product_type TEXT, p_state TEXT DEFAULT NULL)
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
    -- State filter: if p_state is provided, buyer must have that state
    AND (p_state IS NULL OR EXISTS (
      SELECT 1 FROM buyer_states bs WHERE bs.buyer_id = b.id AND bs.state_code = p_state
    ))
  -- Order by remaining credits DESC (weighted: more credits = higher priority)
  ORDER BY (c.total_purchased - c.total_used) DESC, c.purchased_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
