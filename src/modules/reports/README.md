# Module: reports

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Relatórios**: assiduidade, saldos, ausências, dados incompletos,
contratos e histórico de alterações, agrupados por tema, com filtros por centro
e por pessoa e escolha de colunas; para ver no ecrã ou descarregar em CSV.

---

## Technical purpose

Sem tabelas: lê dos módulos donos dos dados (attendance, absences,
time-bank, people, time-base, rosters, audit) através de `ReportSourcesPort`.

## Domain concepts

- `REPORTS` (catálogo, cada um com `group`), `REPORT_GROUPS`, `ReportFilters`, `pickColumns` (só colunas da definição), `toCsv` (`;`, BOM, decimais com vírgula, fórmulas neutralizadas).

## Ports

### Input (use cases)

- `ReportsUseCases` — catálogo (sem o histórico para quem não pode auditar) e correr (filtra pelo âmbito, depois por centro/pessoa; colunas pedidas validadas).

### Output (domain dependencies)

- `ReportSourcesPort` — `rows` e `employeeLocations` (centro principal, para o filtro por centro).

## Adapters

### Input

- `createReportsRouter` → `/api/novo-rh/reports` (`hr.employees`): catálogo, `/:key` (JSON) e `/:key/csv`; query `from`, `to`, `locations`, `employees`, `columns` (ids separados por vírgulas).

## Design decisions (ADR summary)

- ADR-0033: no âmbito de quem consulta; sem NIF/IBAN; ausências privadas mascaradas; histórico sem valores antes/depois.
- FE-063: os filtros por centro/pessoa aplicam-se depois do âmbito (nunca o alargam); uma coluna fora da definição dá 400 `columns` — nunca entra no ficheiro.

## How to test

- `npx jest --config jest.config.cjs src/modules/reports`.

## Known gaps / open debt

- Relatórios calculados a pedido (sem cache); para muitos colaboradores pode ser lento.
- FE-063 pendente: exportação assíncrona via centro de transferências (FE-005, onda 5), PDF/XLSX, step-up para dados pessoais e relatórios legais (D6).
