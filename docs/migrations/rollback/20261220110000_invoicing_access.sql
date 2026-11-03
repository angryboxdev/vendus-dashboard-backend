-- Rollback de 20261220110000_invoicing_access.sql: retira a chave dos perfis (o Admin tem tudo na mesma).
update public.access_profiles set permissions = permissions - 'sales.invoicing', version = version + 1, updated_at = now() where permissions ? 'sales.invoicing';
update public.org_members set permission_overrides = permission_overrides - 'sales.invoicing' where permission_overrides ? 'sales.invoicing';
