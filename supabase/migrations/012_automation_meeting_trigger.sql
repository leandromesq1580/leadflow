-- Migration 012: Automation trigger "meeting_before" (N horas antes de uma reunião)

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN ('stage_entered', 'stage_stale', 'no_response', 'meeting_before'));

ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS meeting_id UUID;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS meeting_source TEXT
  CHECK (meeting_source IS NULL OR meeting_source IN ('appointment', 'calendar_item'));

ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_automation_id_lead_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_unique_no_meeting
  ON automation_runs (automation_id, lead_id)
  WHERE meeting_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_unique_meeting
  ON automation_runs (automation_id, lead_id, meeting_id)
  WHERE meeting_id IS NOT NULL;
