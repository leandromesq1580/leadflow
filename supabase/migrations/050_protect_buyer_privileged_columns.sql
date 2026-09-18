-- 050_protect_buyer_privileged_columns.sql — FECHA UM FURO PRÉ-EXISTENTE (achado na revisão
-- da feature de preços, 18/09/2026). Rodar manualmente no Supabase (SQL Editor).
--
-- A policy `buyers_update_own` (001_initial_schema.sql) deixa o comprador logado atualizar
-- QUALQUER coluna da própria linha via PostgREST (chave anon + JWT) — inclusive is_admin.
-- Um comprador poderia se promover a admin e, entre outras coisas, mudar os preços em
-- /admin/precos. O app NUNCA altera essas colunas pelo browser (só pelo servidor, service
-- role), então o trigger só bloqueia as roles anon/authenticated e não afeta nada legítimo.

CREATE OR REPLACE FUNCTION public.protect_buyer_privileged_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.referral_credit_cents IS DISTINCT FROM OLD.referral_credit_cents
       OR NEW.crm_plan IS DISTINCT FROM OLD.crm_plan
       OR NEW.crm_subscription_status IS DISTINCT FROM OLD.crm_subscription_status THEN
      RAISE EXCEPTION 'coluna privilegiada de buyers só pode ser alterada pelo servidor'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_buyers_protect_privileged ON public.buyers;
CREATE TRIGGER tr_buyers_protect_privileged
  BEFORE UPDATE ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.protect_buyer_privileged_columns();
