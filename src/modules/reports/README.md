# Module: reports

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Relatórios**: assiduidade, saldos, ausências, dados incompletos e
histórico de alterações, para ver no ecrã ou descarregar em CSV.

---

## Technical purpose

Sem tabelas: lê dos módulos donos dos dados (attendance, absences,
time-bank, people, time-base, rosters, audit) através de `ReportSourcesPort`.

## Domain concepts

- `REPORTS` (catálogo), `toCsv` (`;`, BOM, decimais com vírgula, fórmulas neutralizadas).

## Ports

### Input (use cases)

- `ReportsUseCases` — catálogo e correr (filtra pelo âmbito; histórico só com permissão de auditoria).

### Output (domain dependencies)

- `ReportSourcesPort`.

## Adapters

### Input

- `createReportsRouter` → `/api/novo-rh/reports` (`hr.employees`): catálogo, `/:key` (JSON) e `/:key/csv`.

## Design decisions (ADR summary)

- ADR-0033: no âmbito de quem consulta; sem NIF/IBAN; ausências privadas mascaradas; histórico sem valores antes/depois.

## How to test

- `npx jest --config jest.config.cjs src/modules/reports`.

## Known gaps / open debt

- Relatórios calculados a pedido (sem cache); para muitos colaboradores pode ser lento.
