# Module: attendance

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

Novo RH → **Assiduidade**: o colaborador pica no Portal (entrada, pausa,
remoto, saída), mesmo sem rede (a marcação fica em fila e é enviada depois,
sem duplicar). O motor apura cada dia: horas trabalhadas, pausas, noturno,
teórico, excedente e horas pendentes. A gestão corrige com motivo, decide
pedidos de correção e resolve incidentes (falta, saída esquecida, atraso).

**Key concepts for the business:**

- **Marcação** — muda o estado a partir desse instante; nunca é alterada nem apagada.
- **Correção (revisão)** — acrescentar, mudar ou anular uma marcação, sempre com motivo e autor; o colaborador pode recusá-la no prazo, se a regra estiver ligada.
- **Pedido de correção** — o colaborador pede; outra pessoa da gestão decide.
- **Incidente** — um por dia e tipo; as horas de um registo esquecido ficam **pendentes** até a gestão validar.
- **Versão do dia** — um dia já apurado nunca muda em silêncio: um recálculo cria versão nova e, se o excedente mudar, um ajuste.

---

## Technical purpose

Tabelas `clock_events` (append-only, trigger), `clock_revisions` (só o estado
de recusa muda), `clock_correction_requests`, `attendance_days` (versões),
`attendance_adjustments`, `attendance_incidents` (únicos por dia/tipo/origem),
`attendance_recalc_queue` (migração `20261015100000`). Lê o plano diário do
time-base e as regras do settings. Não trata ausências (Fase 5) nem banco de
horas (Fase 6), que vai ler os ajustes daqui.

## Domain concepts

- `effectiveEvents` — originais − anuladas/mudadas + acrescentadas por revisões ativas (recusadas não contam).
- `computeDays` — única fonte dos totais (RE-6); atribuição de jornadas noturnas (RE-7/RE-8); registo esquecido após `maxOpenHours` fecha no fim planeado ou à meia-noite, nunca se arrasta; incidentes deduplicados (RE-14).
- `checkPunch` — IP, entrada antes da hora, coordenadas, zona do centro (D7: desligado por omissão).
- `configHash` — impressão da configuração e do plano de cada versão do dia (TK-13).

## Ports

### Input (use cases)

- `AttendanceUseCases` — picar (RE-9), estado e dias, revisões (RE-10), recusa (RE-11), pedidos de correção, incidentes, ajustes, recálculo (fila).

### Output (domain dependencies)

- `PeriodGuardPort` (módulo periods): datas de períodos fechados — escritas recusadas com 409 `period_closed` (TK-17, RE-30).
- `AttendanceRepositoryPort`, `AttendanceContextPort` (ficha da conta, fuso, regras efetivas, plano diário, centro), `AttendanceAuditPort`, `AttendanceClockPort`, `BackgroundPort`.

## Adapters

### Input

- `createAttendanceMeRouter` → `/api/me/clock*` (Portal; o colaborador é sempre o da sessão).
- `createAttendanceAdminRouter` → `/api/novo-rh/attendance/*` (`hr.attendance`, âmbito por colaborador, Idempotency-Key obrigatório).

### Output

- `SupabaseAttendanceRepository`, `SupabaseAttendanceDirectory` (hr_employees, organizations, locations), `configFromSettings`.

## Design decisions (ADR summary)

- ADR-0027: geolocalização desligada até DPIA; horas de incidentes pendentes até validação; quiosque continua no RH atual.
- Separação de funções: ninguém corrige, aprova ou valida o próprio registo.
- As vistas mostram sempre o valor do motor; o gravado é posto em dia em segundo plano (só dias fechados, antes de hoje).
- IP e coordenadas ficam como evidência, mas não saem nas vistas (minimização).

## How to test

- `npx jest --config jest.config.cjs src/modules/attendance`.

## Known gaps / open debt

- As regras usadas num período são as do último dia do período (mudança de regra a meio do período usa a nova para todo o pedido).
- Fuso da organização (ainda não há fuso por centro).
- Revisão que move uma marcação mais de 2 dias pode não aparecer na leitura por período.
- Avisos ao colaborador (correção recusável, saída automática) chegam com as notificações da Fase 9.
- Sem teste de integração dos triggers append-only/RLS (precisa de Supabase local com Docker, indisponível neste PC) — validar em staging ao aplicar a migração.
