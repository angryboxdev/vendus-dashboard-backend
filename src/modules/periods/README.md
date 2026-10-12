# Module: periods

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Fecho de período**: criar o período (da organização ou de um
centro), ver o que está pendente, fechar (congela os dias), pedir reabertura
(com dupla aprovação) e exportar para salários e faturação.

**Key concepts for the business:**

- **Pré-verificação** — incidentes, pedidos e excedentes por validar dentro do período. Com pendentes, só se fecha aprovando uma exceção com motivo (a lista fica gravada).
- **Fecho** — recalcula e guarda a fotografia dos totais por colaborador. A partir daí não entram correções, ausências, movimentos do banco nem turnos com datas do período.
- **Reabertura** — pedido com motivo e 2 aprovações de pessoas diferentes (nunca quem pediu). Ao voltar a fechar, ficam registadas as diferenças.
- **Exportações** — em fila; o ficheiro fica no centro de transferências com um link que expira em 24 h; o NIF só sai para quem tem permissão de dados sensíveis.

---

## Technical purpose

Tabelas `pay_periods`, `pay_period_closures` (append-only),
`pay_period_reopenings`, `export_jobs` — migração `20261019100000`. Dá aos
módulos attendance, absences, time-bank e rosters a guarda `closedDates`
(TK-17). Os totais vêm dos dias gravados da assiduidade, das ausências
aprovadas e dos movimentos do banco (TK-19).

## Domain concepts

- `diffTotals` / `sumTotals` — diferenças entre fechos e somas do período.
- `payrollCsv` / `billingByLocationCsv` — formatos v1 (D10): `;`, BOM, decimais com vírgula, neutralização de fórmulas.

## Ports

### Input (use cases)

- `PeriodsUseCases` — períodos, pré-verificação, fecho, reabertura (pedido/aprovar/recusar), guarda `closedDates`, exportações (pedir, correr, listar, link, descarregar).

### Output (domain dependencies)

- `PeriodsRepositoryPort`, `PeriodsContextPort` (colaboradores do âmbito, centros, pendentes, preparar, totais, nomes), `PeriodsSupportPort` (token, relógio, segundo plano), `PeriodsAuditPort`.

## Adapters

### Input

- `createPeriodsRouter` → `/api/novo-rh/periods/*` (`hr.closure`, Idempotency-Key obrigatório nas escritas).

### Output

- `SupabasePeriodsRepository`, `locationName`.

## Design decisions (ADR summary)

- ADR-0031: estados aberto/fechado/reaberto; exceção explícita; fecho congela; dupla aprovação; exportações assíncronas com links que expiram; formatos v1 (D10).
- ADR-0032 (proposta): modelo cliente/obra — até ser aprovado, a faturação é por centro.

## How to test

- `npx jest --config jest.config.cjs src/modules/periods` (inclui RE-30/TK-17 com os módulos reais e fakes).

## Known gaps / open debt

- Layouts específicos do software de salários por definir (D10).
- O conteúdo da exportação fica na base de dados até expirar (sem limpeza agendada ainda).
- Horas por centro usam o centro do colaborador em cada dia (não o centro da marcação).
