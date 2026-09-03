-- Sales-team purchasing benefit is NOT staff routing, agency or admin access.
-- No buyers are enrolled automatically. Only authenticated admin API writes.
create table if not exists public.sales_team_pricing (
  buyer_id uuid primary key references public.buyers(id) on delete cascade,
  is_member boolean not null default false,
  lead_unit_price_cents integer not null default 2100
    check (lead_unit_price_cents between 50 and 100000),
  updated_by uuid references public.buyers(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.sales_team_pricing enable row level security;
revoke all on public.sales_team_pricing from public, anon, authenticated;
grant select, insert, update, delete on public.sales_team_pricing to service_role;
comment on table public.sales_team_pricing is
  'Admin-managed sales team membership and paid exclusive-lead pricing; independent of staff and delivery rules.';
notify pgrst, 'reload schema';
