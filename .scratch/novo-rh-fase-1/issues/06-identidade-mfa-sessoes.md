# 06 — Identidade: MFA, revogação, inatividade

Status: resolved

Middleware que exige aal2 para perfis de gestão (MFA_ENFORCEMENT), ecrã de ativação TOTP no frontend, revogação imediata ao mudar perfil/desativar (sessões Supabase), expiração por inatividade como configuração (a_validar). TK-3, TK-4.

## Comments

2026-10-11 — feito. MFA_ENFORCEMENT=novo-rh por omissão; MFA TOTP tem de estar ativa no projeto Supabase. Migração 20261012130000 tem de ir ANTES do deploy. Inatividade só para gestão (Portal fora, de propósito).
