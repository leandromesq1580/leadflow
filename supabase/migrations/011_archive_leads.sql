-- Archive / Unarchive leads
-- Allows the buyer (or team member) to hide a lead from the active pipeline
-- without deleting it. Archived leads disappear from the Kanban view but
-- remain fully queryable via the "Arquivados" view, and can be reactivated
-- at any time (restores them to the owner's default pipeline, first stage).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES buyers(id);

-- Partial index for fast filtering of active leads (most queries)
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived) WHERE archived = FALSE;

-- Partial index for the Archive view (listing archived leads by date)
CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON leads(archived_at DESC) WHERE archived = TRUE;
