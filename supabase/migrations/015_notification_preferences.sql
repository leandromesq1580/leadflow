-- Migration 015: Gestão de avisos de reunião
-- Preferências por buyer + log de reminders enviados (idempotência)

CREATE TABLE IF NOT EXISTS notification_preferences (
  buyer_id UUID PRIMARY KEY REFERENCES buyers(id) ON DELETE CASCADE,
  -- Tempos (minutos antes do evento) para banner + push do navegador
  reminder_intervals INTEGER[] NOT NULL DEFAULT ARRAY[60, 15, 5],
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  banner_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_volume INTEGER NOT NULL DEFAULT 70 CHECK (sound_volume >= 0 AND sound_volume <= 100),
  sound_file TEXT NOT NULL DEFAULT 'chime' CHECK (sound_file IN ('alarm','chime','bell')),
  -- WhatsApp e email têm tempos próprios (geralmente menos pings)
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_intervals INTEGER[] NOT NULL DEFAULT ARRAY[30],
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_intervals INTEGER[] NOT NULL DEFAULT ARRAY[60],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_prefs_owner_all ON notification_preferences;
CREATE POLICY notif_prefs_owner_all ON notification_preferences FOR ALL USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);

DROP TRIGGER IF EXISTS tr_notif_prefs_updated_at ON notification_preferences;
CREATE TRIGGER tr_notif_prefs_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Log de reminders enviados — UNIQUE garante idempotência (mesmo evento + tempo + canal = 1 vez só)
CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('appointment','followup','calendar_item')),
  event_id UUID NOT NULL,
  interval_minutes INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('push','whatsapp','email','banner')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_type, event_id, interval_minutes, channel)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_lookup ON reminder_log(event_type, event_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_buyer ON reminder_log(buyer_id, sent_at DESC);

ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reminder_log_owner_read ON reminder_log;
CREATE POLICY reminder_log_owner_read ON reminder_log FOR SELECT USING (
  buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid())
);
