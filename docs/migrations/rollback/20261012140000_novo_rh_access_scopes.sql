-- Rollback de 20261012140000_novo_rh_access_scopes.sql
-- Antes: exportar âmbitos e regras de privacidade (as alterações ficam no
-- histórico de papéis / audit_events, que não se apagam). Pôr no ar primeiro
-- um backend que não leia scope_kind.

drop table if exists public.access_field_privacy;
drop table if exists public.access_scopes;
alter table public.access_profiles drop constraint if exists access_profiles_scope_kind_ck;
alter table public.access_profiles drop column if exists scope_kind;
