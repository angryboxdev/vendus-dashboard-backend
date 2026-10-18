# Module: attendance

> Status: active
> Last updated: 2026-10-12

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
- `GET /api/me/portal-mode` → `{ source: "novo_rh" | "legacy" }`, a partir de `time_tracking.portal.uses_novo_rh` (por organização ou centro). Com o interruptor ligado, o ponto antigo do Portal recusa (`MOVED_TO_NOVO_RH`) e o quiosque antigo devolve 409 — nunca dois registos de ponto (guardas ligadas em `src/server.ts`).
- `createAttendanceAdminRouter` → `/api/novo-rh/attendance/*` (`hr.attendance`, âmbito por colaborador, Idempotency-Key obrigatório).

### Output

- `SupabaseAttendanceRepository`, `SupabaseAttendanceDirectory` (hr_employees, organizations, locations), `configFromSettings`.

## Design decisions (ADR summary)

- **`boardMany`** (2026-10-18, perf da Visão geral): o `board` de vários colaboradores lê marcações, revisões e incidentes **numa leitura em lote** (`listEventsMany`/`listRevisionsMany`/`listIncidentsMany`, em grupos de 100 ids e páginas de 1000 linhas até esgotar — o PostgREST corta respostas grandes sem erro) em vez de três por pessoa; o resto do apuramento é o mesmo (`compute` com `pre`). Teste prova que o resultado é igual a chamar `board` por pessoa (turno noturno, revisão, incidente validado).

- **Tipos de registo (FE-105):** `clock_types` (formação, deslocação, teletrabalho…): remuneração sempre escolhida (paga / não paga / híbrida), máximo por dia (o excedente não conta), dias e horas bloqueados para começar, "teletrabalho" grava como `remote`. Ao começar com tipo, o servidor verifica bloqueios e o máximo do dia e grava `clock_type_id`; o motor aplica `ClockTypeRule`. Mudar de "obra" para um tipo (ou entre tipos) é uma mudança de estado. Rotas `/api/novo-rh/attendance/clock-types` e `/api/me/clock/clock-types`. Migração `20261024100000`. Fora desta versão: atribuição a pessoas/centros, grupos e ações ao atingir o limite.
- **Catálogo de pausas (FE-103):** `break_types` (remuneração escolhida sempre: paga / não paga / híbrida com N minutos pagos por dia; duração máxima — o excedente não é pago; janela, usos por dia, dias). Ao iniciar uma pausa com tipo, o servidor verifica dia, janela e usos e grava `break_type_id`; o motor aplica a regra do tipo (`BreakRule`). Pausas sem tipo funcionam como antes. As regras de pausas só entram na impressão de configuração dos dias que as usam (criar/alterar uma pausa não gera versões em dias sem ela); alterações são auditadas com motivo e os dias afetados ganham movimento de ajuste (TK-13). Rotas: `/api/novo-rh/attendance/break-types` (catálogo) e `/api/me/clock/break-types` (ativas). Migração `20261023100000`. Fora desta versão: automações de abrir/fechar pausas e alterações agendadas.
- **Fluxo de aprovação das correções (FE-113):** com um fluxo "Correções de ponto" (absences, âmbito `clock`) ativo, cada pedido fixa na criação os níveis e aprovadores (sem quem pede nem o próprio; nível vazio → recurso, RE-23); só o nível atual decide, aprovar num nível intermédio passa ao seguinte e o último cria a revisão. Sem fluxo, decide quem gere a assiduidade (como antes). Migração `20261022100000` (`levels`, `current_level`).
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
