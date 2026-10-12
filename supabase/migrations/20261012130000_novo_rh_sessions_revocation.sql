-- Novo RH — Fase 1, ticket 06 (TK-4): revogação imediata das sessões.
-- Tokens emitidos antes de sessions_revoked_at deixam de valer (o backend
-- compara com o claim iat). Preenchido ao mudar o perfil/as exceções ou o
-- estado do utilizador. Só acrescenta uma coluna nula.
-- ATENÇÃO: o backend desta versão lê a coluna em cada pedido — aplicar ANTES do deploy.

alter table public.org_members add column if not exists sessions_revoked_at timestamptz;
