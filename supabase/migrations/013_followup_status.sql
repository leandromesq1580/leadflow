-- Migration 013: Status em follow_ups (pra marcar "não compareceu")

ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'completed', 'no_show'));

-- Backfill: marca como completed os follow-ups que já tinham completed_at
UPDATE follow_ups SET status = 'completed'
  WHERE completed_at IS NOT NULL AND status = 'pending';
