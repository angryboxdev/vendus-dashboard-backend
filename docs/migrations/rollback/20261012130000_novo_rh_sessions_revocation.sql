-- Rollback de 20261012130000_novo_rh_sessions_revocation.sql
-- Só depois de voltar a pôr no ar um backend que não leia a coluna.
alter table public.org_members drop column if exists sessions_revoked_at;
