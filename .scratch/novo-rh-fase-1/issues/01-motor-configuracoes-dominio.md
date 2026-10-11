# 01 — Motor de configurações: domínio

Status: resolved

Módulo backend `src/modules/settings` (hexagonal). Só domínio + use cases com fakes.

- Catálogo em código: `SettingDefinition` (key, domain, type bool|int|duration|enum|time|list|json, unit, default, min/max, enum, requires[], description, sensitive, legal). Validação de valores por tipo.
- `SettingProfile` (global/segment/personal), `SettingTarget` (location|department|group|employee, valid_from/valid_to), `SettingValue` append-only (valid_from, reason, created_by).
- Resolução por chave e data (D3: pessoal > grupo > departamento > centro > global; empate determinístico) com origem e valor herdado.
- Dependências `requires` → `rule_violation` (TK-7).
- Data de efeito: valor futuro não afeta hoje; retroativo só com permissão (TK-6).

Aceitação: `test_CF_1_*`, `TK_6_*`, `TK_7_*`, `TK_8_*` unitários a passar.

## Comments

2026-10-11 — feito (módulo `src/modules/settings`). Migração 20261012100000 por aplicar em produção.
