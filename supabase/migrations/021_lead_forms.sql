-- Migration 021: lead_forms
-- Aplicações de cliente preenchidas internamente pelo agente (ex.: National Life - Life Insurance).
-- Histórico: múltiplas submissões por lead, cada uma com data/autor. Os documentos
-- (Driver's License, Passaporte) vão pro bucket `lead-attachments` (mesmo dos Anexos)
-- e o caminho fica guardado no JSONB `data`.

CREATE TABLE IF NOT EXISTS lead_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  created_by UUID REFERENCES buyers(id),
  form_type TEXT NOT NULL DEFAULT 'national_life',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_forms_lead ON lead_forms(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_buyer ON lead_forms(buyer_id);

ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buyers_own_lead_forms" ON lead_forms;
CREATE POLICY "buyers_own_lead_forms" ON lead_forms FOR ALL
  USING (buyer_id IN (SELECT id FROM buyers WHERE auth_user_id = auth.uid()));
