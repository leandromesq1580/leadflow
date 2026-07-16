-- 030_availability_hours.sql — granularidade de 1 hora na disponibilidade.
-- Rodar manualmente no Supabase (SQL Editor).
--
-- Semântica (RETROCOMPATÍVEL):
--   hours NULL ou {}  → o PERÍODO INTEIRO está disponível (comportamento atual;
--                       quem já configurou não muda nada)
--   hours {8,10}      → dentro daquele período, só 8h e 10h
--
-- Horas válidas por período (hora local do comprador):
--   morning   = 8..11   · afternoon = 12..17   · evening = 18..20
--
-- O código é tolerante à ausência desta coluna (cai no comportamento de período
-- inteiro), então dá pra deployar antes de rodar isto — mas sem rodar, o usuário
-- não consegue SALVAR a escolha por hora.

alter table public.buyer_availability
  add column if not exists hours smallint[];

comment on column public.buyer_availability.hours is
  'Horas especificas (local do comprador) dentro do periodo. NULL/{} = periodo inteiro.';
