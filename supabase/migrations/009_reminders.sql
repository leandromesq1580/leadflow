-- Migration 009: coluna reminded_at pra controlar reminders de reuniões
-- (evita push duplicado)

ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE calendar_items ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_follow_ups_upcoming ON follow_ups(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND reminded_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_items_upcoming ON calendar_items(start_at)
  WHERE reminded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming ON appointments(scheduled_at)
  WHERE reminded_at IS NULL AND status IN ('scheduled', 'confirmed');
