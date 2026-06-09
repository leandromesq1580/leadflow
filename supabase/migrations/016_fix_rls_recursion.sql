-- 016_fix_rls_recursion.sql
-- ------------------------------------------------------------------------
-- Corrige "infinite recursion detected in policy for relation buyers" (42P17).
--
-- Causa: as policies admin_read_all_buyers / admin_manage_buyers checam se o
-- usuário é admin fazendo EXISTS (SELECT 1 FROM buyers WHERE ...) — uma
-- subquery na PRÓPRIA tabela buyers. Ao avaliar o acesso a buyers, o Postgres
-- re-aplica essas policies, que consultam buyers de novo → recursão infinita.
--
-- Como a policy settings_admin_only também faz EXISTS(SELECT FROM buyers ...),
-- QUALQUER leitura de settings (ex.: o card de Roteamento de Leads) dispara a
-- recursão e falha — o card cai no default "Normal" e a config salva não aparece.
--
-- Solução canônica Supabase: encapsular a checagem numa função SECURITY DEFINER,
-- que roda com o dono e NÃO re-aplica RLS — quebrando a recursão na raiz.
-- ------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.buyers
    where auth_user_id = auth.uid() and is_admin = true
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- Recria as policies recursivas de buyers usando a função (raiz da recursão)
drop policy if exists "admin_read_all_buyers" on buyers;
create policy "admin_read_all_buyers" on buyers
  for select using (public.is_admin());

drop policy if exists "admin_manage_buyers" on buyers;
create policy "admin_manage_buyers" on buyers
  for all using (public.is_admin());

-- settings: troca para a função também (consistência + leitura imediata do card)
drop policy if exists "settings_admin_only" on settings;
create policy "settings_admin_only" on settings
  for all using (public.is_admin());
