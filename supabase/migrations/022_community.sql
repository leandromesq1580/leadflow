-- 022_community.sql — Comunidade Lead4Pro (feed só-pagante: sacadas, vitórias, perguntas)
-- Acesso 100% pela API (service role), que faz o gate de membro pagante. RLS sem policy
-- permissiva = ninguém lê/escreve direto pelo client anon/auth; só o backend gated.

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete set null,
  author_name text,
  kind text not null default 'post' check (kind in ('sacada','win','post')),
  channel text not null default 'geral' check (channel in ('fechamento','follow_up','vitorias','geral')),
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_posts_feed on community_posts (pinned desc, created_at desc);
create index if not exists idx_community_posts_channel on community_posts (channel, created_at desc);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  buyer_id uuid references buyers(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_comments_post on community_comments (post_id, created_at);

create table if not exists community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  buyer_id uuid not null references buyers(id) on delete cascade,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  unique (post_id, buyer_id, kind)
);
create index if not exists idx_community_reactions_post on community_reactions (post_id);

alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_reactions enable row level security;
