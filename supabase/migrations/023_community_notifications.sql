-- 023_community_notifications.sql — notificações da comunidade (comentou/reagiu no seu post)
-- Ranking de fechadores NÃO precisa de tabela (agrega os posts de vitória existentes).
-- Reações ricas NÃO precisam de migration (community_reactions.kind já é texto livre).

create table if not exists community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references buyers(id) on delete cascade,
  actor_id uuid references buyers(id) on delete set null,
  actor_name text,
  type text not null,            -- 'comment' | 'reaction'
  post_id uuid references community_posts(id) on delete cascade,
  preview text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_notif_recipient on community_notifications (recipient_id, read, created_at desc);

alter table community_notifications enable row level security;
