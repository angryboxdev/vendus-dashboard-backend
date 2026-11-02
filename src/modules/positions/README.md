# Module: positions

> Status: active
> Last updated: 2026-11-02

---

## What it is and what it's for (business perspective)

Novo RH → Configurações → Estrutura → **Cargos**: a lista de cargos da
empresa (ex.: Preparador, Gerente de loja), com quantos colaboradores ativos
tem cada um. Cria-se, renomeia-se e ativa-se/inativa-se; nunca se apaga
(quem já tem um cargo inativo mantém-no).

**Key concepts for the business:**

- **Cargo** — função na empresa; não dá permissões (isso é o perfil de acesso).
- **Nome único** — «Preparador», «preparador» e « PREPARADOR » são o mesmo cargo.

---

## Technical purpose

Tabela `hr_positions` (já existente). Auditoria em `hr_audit_logs`
(`entity_type = position`), onde está o histórico anterior.

## Domain concepts

- `Position` — nome normalizado, descrição, ativo.

## Ports

### Input (use cases)

- `ListPositionsUseCase`, `CreatePositionUseCase`, `UpdatePositionUseCase`, `SetPositionActiveUseCase`.

### Output (domain dependencies)

- `PositionRepositoryPort`, `PositionHoldersPort` (cargo e estado de cada colaborador, só para contar), `PositionAuditPort`.

## Adapters

### Input

- `PositionsController` → `/api/novo-rh/positions` (GET, POST, PATCH `/:id`, PATCH `/:id/active`); escrita com `requireMinRole("manager")`; permissão `company.positions` na matriz.

### Output

- `SupabasePositionRepository`, `SupabasePositionHoldersAdapter` (`hr_employees`), `SupabasePositionAuditAdapter` (`hr_audit_logs`, falha nunca interrompe a operação).

## Design decisions (ADR summary)

- **Saiu do módulo `hr` antigo** (ADR-0040, fase 4, 2026-11-02): mesmo código e contrato; `/api/hr/positions` deixou de existir (o frontend já só usava `/api/novo-rh/positions`, onde também se aplica o modo Demonstração).
- Nunca há DELETE; inativar não tira o cargo a quem o tem.

## How to test

- `npx jest --config jest.config.cjs src/modules/positions`.

## Known gaps / open debt

- O inventário da matriz de permissões não vê rotas registadas com uma variável (`registerAt(base)`), por isso estas rotas não aparecem em `docs/matriz-autorizacao.md` — estão classificadas em `route-permissions.ts` (teste em `positions-routes.test.ts`).
