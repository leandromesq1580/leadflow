-- 027_community_avisos.sql — tipo de post 'aviso' (admin posta avisos oficiais) + canal 'avisos'.
alter table community_posts drop constraint if exists community_posts_kind_check;
alter table community_posts add constraint community_posts_kind_check check (kind in ('sacada','win','post','poll','aviso'));

alter table community_posts drop constraint if exists community_posts_channel_check;
alter table community_posts add constraint community_posts_channel_check check (channel in ('fechamento','follow_up','vitorias','geral','avisos'));
