# Module: reports

> Status: active
> Last updated: 2026-10-22

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

- Assiduidade por blocos (`domain/entities/attendance-days.ts`, 2026-10-22): `toDayRow` reduz o dia do motor (`DayBoard`) a planeado, trabalhado, atraso (+ minutos), falta (sem ausência/feriado), saída esquecida e dia justificado; `ATTENDANCE_DAYS_MAX` = 31; `ExportTable` + `exportTableProblem` (tamanhos e tipos) + `safeCell` (fórmulas neutralizadas).
- `REPORTS` (catálogo, cada um com `group`), `REPORT_GROUPS`, `ReportFilters`, `pickColumns` (só colunas da definição), `toCsv` (`;`, BOM, decimais com vírgula, fórmulas neutralizadas).

## Ports

### Input (use cases)

- `AttendanceDaysUseCases` — `run` (âmbito de quem consulta, depois centro / grupo / departamento com vigência / pessoa; ativos e quem saiu no período; dias antes da admissão não contam) e `exportXlsx` (formata uma tabela já calculada no ecrã).
- `ReportsUseCases` — catálogo (sem o histórico para quem não pode auditar) e correr (filtra pelo âmbito, depois por centro/pessoa; colunas pedidas validadas).

### Output (domain dependencies)

- `AttendanceDaysSourcesPort` — `people`, `units` (grupos/departamentos num dia) e `daysMany` (`attendance.boardMany`, ≤ 31 dias). `TableWriterPort` — `xlsx`.
- `ReportSourcesPort` — `rows` e `employeeLocations` (centro principal, para o filtro por centro).

## Adapters

### Input

- `createReportsRouter` → `/api/novo-rh/reports` (`hr.employees`): catálogo, `/:key` (JSON) e `/:key/csv`; query `from`, `to`, `locations`, `employees`, `columns` (ids separados por vírgulas). `GET /attendance/days?from&to&locations&groups&departments&employees` (≤ 31 dias) e `POST /export/xlsx` (campo de formulário `table`, JSON — fora do limite de 100 KB do corpo JSON; classificado como READ).

### Output

- `XlsxTableWriterAdapter` (`xlsx`): título, subtítulo, cabeçalho e linhas; números ficam números.

## Design decisions (ADR summary)

- ADR-0033: no âmbito de quem consulta; sem NIF/IBAN; ausências privadas mascaradas; histórico sem valores antes/depois.
- FE-063: os filtros por centro/pessoa aplicam-se depois do âmbito (nunca o alargam); uma coluna fora da definição dá 400 `columns` — nunca entra no ficheiro.

## How to test

- `npx jest --config jest.config.cjs src/modules/reports`.

## Known gaps / open debt

- Relatórios calculados a pedido (sem cache); para muitos colaboradores pode ser lento. A assiduidade por blocos obriga o ecrã a pedir mês a mês (o motor apura ≤ 31 dias); «desde a admissão» vai até 2 anos.
- FE-063 pendente: exportação assíncrona via centro de transferências (FE-005, onda 5), PDF/XLSX, step-up para dados pessoais e relatórios legais (D6).
