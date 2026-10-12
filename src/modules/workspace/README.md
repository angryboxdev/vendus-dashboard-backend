# Module: workspace

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Tarefas, Solicitações e Quem está**: tarefas operacionais com
checklist e prazo; formulários de pedidos personalizados (ex.: fardamento)
decididos pela gestão; e quem está a trabalhar agora, só do próprio centro.

---

## Technical purpose

Tabelas `ops_tasks`, `custom_request_forms`, `custom_requests` — migração
`20261020100000`. "Quem está" lê as marcações da assiduidade.

## Domain concepts

- `validateTask`, `missingRequired` (só conclui com os obrigatórios feitos).
- `validateForm` (C6.3: título, até 50 campos), `validateAnswers`.
- `visiblePresence` (CF-15: só o próprio centro, por omissão).

## Ports

### Input (use cases)

- `WorkspaceUseCases` — tarefas (criar, marcar itens, concluir, cancelar, as minhas), formulários, pedidos (submeter, os meus, decidir), quem está.

### Output (domain dependencies)

- `WorkspaceRepositoryPort`, `WorkspaceContextPort`.

## Adapters

### Input

- `createWorkspaceRouter` → `/api/novo-rh/workspace/*` (`hr.employees`), `/api/me/ops-tasks*`, `/api/me/custom-requests*`, `/api/me/whos-in`.

### Output

- `SupabaseWorkspaceRepository`.

## Design decisions (ADR summary)

- ADR-0033: visibilidade mínima (só o próprio centro, sem contactos); ninguém decide o seu próprio pedido.

## How to test

- `npx jest --config jest.config.cjs src/modules/workspace`.

## Known gaps / open debt

- Formulários sem fluxo de aprovação multinível (decide a gestão).
