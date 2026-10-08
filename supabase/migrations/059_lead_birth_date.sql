-- 059: data de nascimento do lead (ficha web substitui o campo "Plataforma" por "Data de nascimento").
-- A coluna platform NÃO é removida — só deixa de ser editável pela ficha (histórico/importações continuam).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN leads.birth_date IS 'Data de nascimento do lead (editável na ficha do lead; PATCH /api/leads/[id] valida YYYY-MM-DD).';
