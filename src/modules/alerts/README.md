# Module: alerts

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Alertas**: avisos que nascem de regras (pedidos parados há N dias,
contratos ou períodos experimentais a terminar, tarefas em atraso), com dono,
prazo para tratar, escalonamento quando o prazo passa e fecho com nota.

**Key concepts for the business:**

- **Regra** — tipo, N dias, dono, prazo (horas), a quem escala.
- **Ciclo** — aberto → em tratamento → fechado; fecha sozinho quando a origem deixa de estar pendente.

---

## Technical purpose

Tabelas `alert_rules`, `alerts` (um aberto por regra e origem) — migração
`20261020100000`. As origens vêm dos módulos absences, attendance, periods,
rosters, workspace e people (funções do servidor).

## Domain concepts

- `qualifies` (RE-24: pendente há N dias / a acontecer dentro de N dias), `needsEscalation`, `validateRule`.

## Ports

### Input (use cases)

- `AlertsUseCases` — regras, avaliar (abrir, fechar sozinho, escalar), listar (avalia de 10 em 10 min), tratar, fechar.

### Output (domain dependencies)

- `AlertsRepositoryPort`, `AlertsContextPort` (origens, donos, notificar, relógio, auditoria).

## Adapters

### Input

- `createAlertsRouter` → `/api/novo-rh/alerts/*` (`hr.overview`).

### Output

- `SupabaseAlertsRepository`.

## Design decisions (ADR summary)

- ADR-0033: RE-24/RE-36; pedidos nunca expiram sozinhos (o alerta é a "expiração"); avaliação ao consultar.

## How to test

- `npx jest --config jest.config.cjs src/modules/alerts`.

## Known gaps / open debt

- Sem tarefa agendada: a avaliação acontece ao consultar ou com "Avaliar agora".
