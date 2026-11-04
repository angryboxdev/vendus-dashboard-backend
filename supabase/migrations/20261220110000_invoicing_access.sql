-- Faturação certificada AT: funcionalidade «sales.invoicing» no perfil de sistema Admin
-- (os outros perfis ficam sem acesso até alguém o conceder). Idempotente.
update public.access_profiles set permissions = permissions || '{"sales.invoicing": "MANAGE"}'::jsonb, version = version + 1, updated_at = now() where system_key = 'admin' and not (permissions ? 'sales.invoicing');
