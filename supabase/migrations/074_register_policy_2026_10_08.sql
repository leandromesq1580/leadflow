-- 074: registra a versão de política vigente no código (src/lib/policies.ts).
-- O commit 4d0571d (09/10) subiu CURRENT_POLICY_VERSION para 2026-10-08.1 sem registrar a linha aqui;
-- purchase_consents.policy_version tem FK para policy_versions, então todo webhook de compra de leads
-- falhava com 500 (23503) e o pagamento ficava sem crédito. Só acrescenta uma linha; idempotente.
INSERT INTO public.policy_versions (version, sha256, public_url, source_path, summary)
VALUES (
  '2026-10-08.1',
  'd89f6c9e3d9ffc77a2ca387e90be8de39d4146ae6c0b8eda40e3fa4d99b237fe',
  'https://lead4producers.com/politicas',
  'src/components/localized-policy-page.tsx',
  jsonb_build_object(
    'languages', jsonb_build_array('pt', 'en', 'es'),
    'note', 'Registrada em 2026-10-20, depois de publicada em 2026-10-09 (commit 4d0571d); o texto é o do SHA acima.'
  )
)
ON CONFLICT (version) DO NOTHING;
