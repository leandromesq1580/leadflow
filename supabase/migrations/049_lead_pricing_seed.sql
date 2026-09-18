-- 049_lead_pricing_seed.sql — catálogo de preços de leads gerido pelo admin (/admin/precos).
-- Rodar manualmente no Supabase (SQL Editor). OPCIONAL: o código funciona sem esta linha
-- (sem linha = padrão de fábrica de src/lib/stripe.ts). Só documenta/semeia o formato.
--
-- settings.key = 'lead_pricing' (JSONB):
--   { "version": 1,
--     "lead":      { "packages": [ { "quantity": 10, "unitPriceCents": 2800 }, ... ] },
--     "cold_lead": { "packages": [ { "quantity": 25, "unitPriceCents": 400 }, ... ] },
--     "updated_at": iso, "updated_by": buyers.id, "updated_by_email": text }
-- settings.key = 'lead_pricing_history' → { "entries": [ versões anteriores, máx. 30 ] }
--
-- Quem lê: src/lib/lead-pricing.ts (checkout, compra web/app, cupom, landing, calculadora).
-- Escrita só pela API admin (service role); RLS de settings continua "admin only".

INSERT INTO settings (key, value)
VALUES ('lead_pricing', '{
  "version": 1,
  "lead": { "packages": [
    { "quantity": 10, "unitPriceCents": 2800 },
    { "quantity": 25, "unitPriceCents": 2600 },
    { "quantity": 50, "unitPriceCents": 2300 }
  ] },
  "cold_lead": { "packages": [
    { "quantity": 25,  "unitPriceCents": 400 },
    { "quantity": 50,  "unitPriceCents": 400 },
    { "quantity": 100, "unitPriceCents": 300 }
  ] },
  "updated_by": null, "updated_by_email": null
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
