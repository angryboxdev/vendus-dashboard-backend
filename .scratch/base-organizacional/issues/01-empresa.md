Status: done

# Empresa (perfil da Organization)

Expandir `organizations` (razão social, NISS, morada fiscal, código postal, localidade, país, telefone, website, timezone, logotipo, estado). Novo módulo `organization` com GET/PATCH, upload de logotipo (bucket privado), auditoria em `organization_audit_logs`. Frontend: área "Empresa & Estrutura" com aba Empresa. Edição só admin.

## Comments

- 2026-10-04 — Implementado. Backend: módulo `organization`, migração
  `20261004100000_organization_profile.sql` (**pendente de aplicação manual**),
  bucket `organization-assets`, `organization_audit_logs`. Frontend: módulo
  `organization`, rota `/empresa`, item "Empresa & Estrutura" no menu.
  Teste de integração escrito mas não executado (Supabase local indisponível).
