-- 026_community_bans.sql — moderação: membros bloqueados da comunidade.
-- Um membro banido perde o acesso (allowed=false) em TODA rota da comunidade.
create table if not exists community_bans (
  buyer_id uuid primary key references buyers(id) on delete cascade,
  banned_by uuid references buyers(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
alter table community_bans enable row level security;
