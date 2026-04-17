-- Migration 007: Calendar items (eventos + tarefas) independentes de leads

CREATE TABLE IF NOT EXISTS calendar_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'task')),
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,
  color TEXT DEFAULT '#10b981',
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_items_buyer ON calendar_items(buyer_id, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_items_lead ON calendar_items(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_items_pending_tasks ON calendar_items(buyer_id, start_at)
  WHERE kind = 'task' AND completed_at IS NULL;

ALTER TABLE calendar_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_items_owner_all ON calendar_items;
CREATE POLICY calendar_items_owner_all ON calendar_items FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);
