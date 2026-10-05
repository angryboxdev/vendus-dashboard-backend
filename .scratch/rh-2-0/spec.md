# Spec — RH 2.0 (Modelos & Automatizações · Férias & Ausências 2.0 · Feriados/Compensações)

Status: in-progress
Origem: `Task_RH_2_0_Modelos_Automatizacoes_Ferias_Feriados_Compensacoes.md`
(enviada pelo utilizador em 2026-10-05) + `patch-folga-compensatoria.md`
(aplicado por cima) + 6 mockups em `Desktop/task2/`.
Branch: `branch-rh` (backend + frontend).

## Objetivo

Evoluir o RH sem estruturas paralelas: um único motor de geração de
turnos (Modelo → Automatização → Turno), Férias & Ausências com escrita no
padrão novo e ligação às Escalas, e tratamento do trabalho em feriado no
Fecho Mensal com crédito de folga compensatória gerido em Férias &
Ausências.

## Estado atual (levantamento 2026-10-05)

- **Três motores de geração** concorrentes: escala base
  (`hr_base_schedule*`, `apply-base-schedule`), rotação A/B
  (`hr_shift_rotations`, re-aplicar sobrescreve os turnos dela) e série
  semanal ("Novo Turno Padrão Semanal", `series_id`). Todos **saltam
  feriados** e dias de ausência. Motor puro reutilizável:
  `shift-recurrence.service` (`expandRecurrence`, `partitionOccurrences`,
  sobreposição com repartido/meia-noite).
- `hr_work_shifts`: `status draft|published`, `source
  manual|base_schedule|rotation`, `rotation_id`, `series_id`. **Apagar é
  hard delete** (bloqueado se houver presença). Sem cancelamento.
- Ausências: legacy (`hrLeaveService`, `hr_leave_requests`: tipos
  `vacation|sick_leave|justified|unjustified|compensatory`, só datas, sem
  estado, delete físico). UI legacy `HrLeavePage` (`/hr/ferias`). O `hr`
  só lê (`LeaveReadPort`).
- **Não existe banco de horas/crédito.**
- Fecho Mensal: `hr_monthly_closures` por organização × mês, snapshot do
  resumo por colaborador; só bloqueia correções de assiduidade.
- Cron: rotas internas `/api/internal/cron/*` (Bearer `CRON_SECRET`, fan-out
  por organização); nada as agenda para o RH.
- Feriados: `HolidayReadPort` lê só feriados de âmbito Empresa (D6 da Base
  Organizacional).

## Decisões

Confirmadas pelo utilizador (2026-10-05):

- **R1 — Turnos gerados entram em rascunho**; o gestor revê e publica.
- **R2 — Um só motor:** Rotação A/B, "Novo Turno Padrão Semanal" **e
  Escala base** são absorvidos em Modelos + Automatizações (dados
  migrados); as UIs antigas saem das Escalas.
- **R3 — "Substituir turno existente" nunca** quando o turno tem presença
  registada (só Manter/Ignorar).
- **R4 — Feriados: criar e assinalar.** O novo motor cria o turno num
  feriado e o preview mostra "Feriado" (o gestor pode desmarcar). O Fecho
  trata depois a compensação.
- **R5 — Geração: botão + cron preparado.** "Gerar próximas X semanas"
  sempre disponível; rota diária `/api/internal/cron/hr-shift-automations`
  pronta (fica automática quando o Raul a agendar no Render). Conflitos
  nunca são forçados — vão para "Alertas e ações".

Técnicas (minhas, a validar na revisão dos tickets):

- **T1 — Snapshot + origem no turno:** `hr_work_shifts` ganha
  `template_id`/`automation_id` (referência, `on delete set null`) e
  `source` ganha `template`/`automation`; o horário/local ficam copiados no
  turno (já é assim). Alterar Modelo/Automatização nunca toca turnos.
- **T2 — Idempotência:** antes de criar, o motor ignora a ocorrência se já
  existir turno do mesmo colaborador sobreposto (mesma lógica de
  sobreposição do motor atual, cobre repartido e meia-noite) — gerar duas
  vezes não duplica. Na BD, índice único `(org_id, employee_id, work_date,
  start_time)` em turnos não cancelados como rede de segurança.
- **T3 — Turno cancelado, nunca apagado** quando há histórico: novo estado
  `cancelled` em `hr_work_shifts` (+ `cancelled_at/by/reason`), excluído do
  calendário, contagens e assiduidade. Apagar continua possível só para
  rascunhos sem presença (comportamento atual).
- **T4 — Ausências passam ao padrão novo** (escrita no `hr`), na mesma
  tabela `hr_leave_requests` estendida: `status active|cancelled`,
  `start_time/end_time` (parcial), `minutes` (parciais), `credit_id`.
  Nunca delete físico pelo código novo. Legacy continua a funcionar.
- **T5 — Crédito de folga em minutos:** tabela nova
  `hr_compensatory_credits` (origem = feriado trabalhado, único por
  colaborador × data × origem) + `hr_compensatory_credit_usages`. Decisão
  no Fecho + crédito numa **função Postgres (RPC)** — atómica e idempotente.
- **T6 — Feriados por Local entram no RH 2.0** (task §13): o RH passa a
  considerar feriados da Empresa **e** do Local do turno (substitui D6).
- **T7 — Fecho continua por organização × mês** (tabela atual); a vista
  por colaborador ganha as novas colunas. Alterações à origem num período
  fechado ficam bloqueadas (turnos, ausências, tratamentos) até Reabrir.

## Fases e tickets (ver `issues/`)

Fase 2 — Modelos & Automatizações: 01 Modelos de turno · 02 Aplicar
modelo (preview/conflitos) · 03 Automatizações + geração · 04 Rotação e
Escala base absorvidas (migração + saída das UIs antigas).
Fase 3 — Férias & Ausências 2.0: 05 Ausências (padrão novo, parcial,
estado, cancelamento de turnos) · 06 Ausências nas Escalas
("Colaborador indisponível").
Fase 4 — Feriados & Compensações: 07 Feriados trabalhados + política +
tratamento no Fecho · 08 Crédito de folga compensatória (gestão em Férias
& Ausências) · 09 Fecho por colaborador + consistência de período fechado.

## Fora de âmbito

Task "NÃO IMPLEMENTAR": folha salarial, pagamentos, IRS/SS, aprovação de
férias, portal do colaborador, troca de turnos, IA/otimização, novo
calendário/assiduidade/fecho/documentos. Também: cálculo do direito anual
a férias (task §10).
