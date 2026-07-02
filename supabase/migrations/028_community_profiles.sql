-- 028_community_profiles.sql — perfil do membro na comunidade: foto (avatar) + bio.
alter table buyers add column if not exists community_bio text;
alter table buyers add column if not exists community_avatar_path text;
