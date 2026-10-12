# Module: time-base

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

Novo RH → **Tempo**: os horários (fixos ou flexíveis, com versões por data),
os calendários de feriados por centro e os de férias, a quem se aplicam e
desde quando, e o **tempo teórico** de cada colaborador em cada dia — a base
de toda a assiduidade (Fase 4) e das férias (Fase 5).

**Key concepts for the business:**

- **Horário fixo** — faixas por dia (ex.: 09:00–13:00 e 14:00–18:00); **noturno** quando passa a meia-noite.
- **Horário flexível** — horas por dia, sem hora marcada.
- **Versão** — o horário muda a partir de uma data; os dias anteriores ficam com a versão antiga.
- **Feriado "a confirmar"** — importado ou por validar; só um feriado **confirmado** tira o dia ao teórico.
- **Tempo teórico** — o que estava planeado trabalhar nesse dia.

---

## Technical purpose

Tabelas `work_schedules`, `work_schedule_versions`, `holiday_calendars`,
`holiday_calendar_days`, `vacation_calendars`, `time_assignments`
(migração `20261014100000`). Cálculo do teórico e do dia local no fuso do
centro. Não regista marcações (Fase 4) nem saldos de férias (Fase 5).

## Domain concepts

- `ScheduleVersion` — dias com faixas (fixo) ou minutos (flexível), `night`, `halfDayMinutes`; versões sem sobreposição; nova versão fecha a aberta na véspera.
- `resolveAssignment` — pessoal > grupo > departamento > centro (mesma ordem D3 das configurações).
- `theoreticalDay` — feriado confirmado → 0; "a confirmar" → aviso; sem horário → 0 com motivo `no_schedule`; modo contrato (C3.10) = horas semanais ÷ dias de trabalho; meio dia.
- `workday.service` — dia local de um instante, limites do dia em UTC e duração real (23/25 h nas mudanças de hora).
- Nenhum valor legal no código (ADR-0026): limites ficam no motor de configurações, domínio `legal`, sem valor.

## Ports

### Input (use cases)

- `TimeBaseUseCases` — horários/versões, calendários de feriados (dias, confirmar, importar nacionais), férias, eliminar com impacto (RE-35), atribuições, teórico, atribuições de um colaborador.

### Output (domain dependencies)

- `TimeBaseRepositoryPort`, `EmployeeTimeContextPort` (unidades, horas de contrato, modo do teórico), `TimeImpactPort`, `NationalHolidaysPort` (PT do módulo calendar), `TimeAuditPort`, `TimeClockPort`.

## Adapters

### Input

- `createTimeBaseRouter` → `/api/novo-rh/time/*` (horários/atribuições/teórico `hr.schedules`; feriados `company.holidays`; férias `hr.leave`).

### Output

- `SupabaseTimeBaseRepository`.

## Design decisions (ADR summary)

- ADR-0026: legais sem valor; feriados nacionais importados "a confirmar"; os regionais nunca são substituídos.
- Eliminar calendário = apagar logicamente (fica para a auditoria), termina as atribuições e exige escrever o nome.

## How to test

- `npx jest --config jest.config.cjs src/modules/time-base`.

## Known gaps / open debt

- Feriados nacionais de Espanha sem cálculo (adicionar à mão com fonte oficial).
- Meio dia de férias real chega com os pedidos (Fase 5); hoje é um parâmetro do cálculo.
- Pausas (C4.2) e horas categorizadas (C4.6) ficam para a Fase 4.
