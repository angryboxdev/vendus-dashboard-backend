# Novo RH — Fase 1: Fundação (identidade, acessos, organização, motor de configurações)

Status: em curso (aprovada 2026-10-11, "vamos pra próxima fase")
Fonte: `Desktop/TASK_Desenvolvimento_Faseado_RH.md` §6 Fase 1; Engenharia
Reversa 09, 12.1, 12.5, 13; Configurações C2, C3.1–C3.7, C3.11, C9, C11.
Decisões: ADR-0018..0024 (D0 risco aceite, D2 Supabase Auth + TOTP, D3
pessoal > grupo > departamento > centro > global).

## Objetivo

Base de segurança e **motor de configurações** antes de qualquer módulo
funcional do Novo RH. Cada opção concreta de configuração chega depois, com o
módulo a que pertence.

## O que já existe (reaproveitar, não refazer)

| Spec | Existente | Lacuna |
|---|---|---|
| `tenant` | `organizations` (+ perfil: NISS, morada, fuso, país) | — |
| `legal_entity` | a própria `organizations` (1 entidade por organização) | várias entidades legais por tenant — fora da Fase 1 (Angry Box tem uma) |
| `org_unit` centro | `locations` (fuso obrigatório, lat/lng, `geofence_radius_m`) | raio 10–1000 validado na BD |
| `org_unit` departamento / grupo | — | **criar** (grupo hierárquico, sem ciclos) |
| `job_position` | `hr_positions` | — |
| `role` / `role_permission` | `access_profiles` (NONE/READ/MANAGE por funcionalidade) | tipo Geral/Específico, **âmbitos**, privacidade por campo, histórico exportável |
| `user_account` + MFA | Supabase Auth (`auth.users`), `org_members` | **MFA obrigatória (aal2)**, revogação imediata, inatividade |
| `audit_log` | tabelas de auditoria por domínio (`*_audit_logs`) | **auditoria transversal append-only** com IP/dispositivo e cadeia de hash |
| Contactos por função (C3.11) | — | **criar** |
| Aceitação de termos/DPA (C3.7) | — | **criar** |
| Motor de configurações (C11) | regras soltas (`hr_attendance_rules`, etc.) | **criar** |
| Notificações | só badges/caixa de pedidos | fila + canal na app (e-mail fica para D12/Fase 9) |
| Ficheiros | Supabase Storage com prefixo por organização e URLs assinadas | validação de tipo/tamanho partilhada |

## Decisões desta fase (minhas, seguras/restritivas — task §4.6.6)

- **F1-1** Motor de configurações num módulo novo `settings` (backend e frontend). Catálogo `setting_definition` **em código** (versionado no git), não na BD.
- **F1-2** Valores **append-only**: trigger na BD recusa `update`/`delete` em `setting_values`; "alterar" = nova linha com `valid_from` e motivo obrigatório. Retroativo (`valid_from` < hoje) só com permissão especial `company.settings_retroactive`.
- **F1-3** Resolução por chave e por data (C11.2) com a ordem D3; empate no mesmo nível → `valid_from` mais recente do alvo, depois `profile_id`. Sem valor em nenhum perfil → default do catálogo.
- **F1-4** Parâmetros legais no catálogo têm `legal: true` e o seu default leva `a_validar: true`; a UI mostra-o.
- **F1-5** Permissões novas no catálogo de acessos: `company.settings` (Ver/Gerir configurações), especial `company.settings_retroactive`, `company.structure` (departamentos, grupos, contactos), `company.audit` (ver/exportar auditoria).
- **F1-6** MFA (TK-3): perfis de gestão = qualquer perfil com alguma permissão `MANAGE` ou Admin. Sem `aal2` no token → 403 `mfa_required` nas rotas `/api/novo-rh/**` e de administração. **Arranque desligado por variável `MFA_ENFORCEMENT=off|novo-rh|all`** — ligar `all` exige que os utilizadores ativem a app autenticadora primeiro (comunicação com o Raul).
- **F1-7** Endpoints novos sob `/api/novo-rh/...`, com Idempotency-Key + If-Match + RFC 7807 (ADR-0022) e store de idempotência persistente.

## Tickets

| N.º | Ticket | Testes |
|---|---|---|
| 01 | Motor de configurações — domínio (catálogo, perfis, alvos, valores, resolução) | CF-1, TK-6, TK-7, TK-8 (unitários) |
| 02 | Motor de configurações — persistência, API, histórico e impacto | CF-12, TK-6/7 HTTP |
| 03 | Auditoria transversal append-only | — (base do DoD) |
| 04 | Estrutura: departamentos, grupos, pertenças com vigência, contactos, termos/DPA | — |
| 05 | Acessos: tipo Geral/Específico, âmbitos, privacidade por campo, histórico de papéis | RE-34 (parte), TK-5 |
| 06 | Identidade: MFA (aal2), revogação imediata, inatividade | TK-3, TK-4 |
| 07 | Frontend: Novo RH → Configurações (valor efetivo, origem, herdado, histórico, dependências, impacto) | — |
| 08 | Frontend: Estrutura e Papéis no Novo RH | — |
| 09 | Isolamento entre tenants (RE-33) e matriz por âmbito | RE-33, TK-5 |
| 10 | Notificações (fila + na app) e validação de ficheiros | — |
| 11 | Relatório de gate da Fase 1 | — |

## Fora desta fase

Várias entidades legais por tenant; IdP corporativo; e-mail/push (D12);
opções concretas de configuração de ponto/ausências (fases 4–5).
