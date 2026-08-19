-- 040: histórico do Case Communication do portal NL dentro da apólice
-- (pedido 17/08: "eu preciso do histórico da comunicação e as ações deles").
-- Sem esta coluna o sync continua funcionando — só não guarda o histórico.
ALTER TABLE policies ADD COLUMN IF NOT EXISTS case_comm JSONB;
