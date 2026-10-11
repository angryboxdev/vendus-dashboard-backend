# 02 — Motor de configurações: persistência e API

Status: resolved
Blocked by: 01

- Migração: setting_profiles, setting_profile_targets, setting_values (trigger anti update/delete), http_idempotency_keys; RLS + política org-claim; rollback em docs/migrations/rollback.
- Adapter Supabase via scoped-query; TABLE_REGISTRY.
- API /api/novo-rh/settings: definitions, profiles (GET/POST), values (POST com motivo, Idempotency-Key, If-Match), effective (por colaborador/data), audit (histórico + export CSV), impact-preview.
- Classificar rotas em route-permissions.ts; permissões novas no catálogo (back + front).

Aceitação: CF-12 (histórico antes/depois/motivo exportável) e TK-6/TK-7 por HTTP.

## Comments

2026-10-11 — feito (módulo `src/modules/settings`). Migração 20261012100000 por aplicar em produção.
