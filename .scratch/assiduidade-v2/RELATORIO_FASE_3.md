# Assiduidade V2 — Fase 3 (integração) — relatório

Data: 2026-10-29. Aprovação: «aprovo pode integrar e avançar» (pré-visualização + opção B). ADR-0043.

## Alterações

### Backend (`rh`)
- Migração `20261210100000_attendance_day_reviews.sql` (idempotente, RLS `org_id = current_org()`, índice único parcial por dia ativo) + rollback `docs/migrations/rollback/20261210100000_attendance_day_reviews.sql`; tabela registada em `table-registry.ts`.
- Domínio: `domain/entities/day-review.ts`, `domain/services/day-review.ts` (`applyReview`, `reviewState`, `classifyReview`).
- Motor: `compute()` aplica a decisão ativa; `hashFor` inclui a decisão (versão nova + ajuste); `DayPlan` ganha `plannedRanges`/`restDay`/`holiday` (informativos, fora da impressão).
- Casos de uso: `conferenceWeek`, `applyConference`, `voidConferenceReview`; `boardMany` passa a usar `preload` (também lê decisões).
- Rotas: `GET /api/novo-rh/attendance/conference`, `POST …/conference/apply`, `POST …/conference/reviews/:id/void` (`hr.attendance`, âmbito por colaborador, Idempotency-Key obrigatório).
- `server.ts`: o plano da assiduidade passa as faixas e o tipo de dia.

### Frontend (`rh`, vindo de `preview/assiduidade-v2`)
- `adapters/in/attendance/conference/` (ConferencePanel, ConferenceView, WeekGrid, ReviewDrawer, review-ui) + `domain/entities/attendance-review.ts` + `domain/services/attendance-review.service.ts`.
- Porta/adaptador: `conference`, `applyConference`, `voidConferenceReview` (`toReviewWeek` converte segundos → minutos).
- `AttendanceView`: Conferência por omissão; Dias, Dia da equipa, Pedidos de correção, Incidentes e Pausas em «Outras vistas».
- Retiradas as ações rápidas (`DayQuickActions`, `day-actions.service`, chaves `att.quick.*`): «Cumpriu» só existe no painel.
- Ausência com tipo: `absences.assign` por dia e depois confirmação na conferência.

## Testes
- Backend: `conference.test.ts` (casos 6, 7, 8, 9, 10, 14, 17, 20, fechado/próprio/âmbito, manual, anular, semana com pausa e noturno), `day-review.test.ts`, controller. `npm run check:ci`: 418 suites / 3283 testes, sem violações de dependências; `authz:matrix`: 806 endpoints, 0 não classificados.
- Frontend: 129 ficheiros / 728+ testes, typecheck e eslint limpos.

## Riscos
- **Migração obrigatória antes do backend novo** — todas as leituras de assiduidade passam a ler `attendance_day_reviews`.
- O backend local usa a BD de produção: não correr este `rh` em localhost antes de a migração estar aplicada.
- Ausência com tipo + confirmação = dois pedidos (não atómico).
- «Cumpriu» não recalcula horas noturnas; tolerância da pré-visualização no ecrã fixa (o servidor decide).
- Casos 15/16 (viragem do dia e hora de verão com dados reais) cobertos pelo motor existente, não por testes novos; 18/19 (reabertura, coerência relatórios/fecho) garantidos por o validado entrar no `compute` — validar em produção com um dia de teste.

## Como validar (depois do deploy)
1. `GET /api/health` = commit novo; tabela `attendance_day_reviews` existe.
2. Conferência → Semana: um dia com atraso → Rever → «Cumpriu» + declaração → Conforme/Revisto; Dias (Outras vistas) mostra 8h; Relatórios → Assiduidade com o mesmo valor.
3. Anular a decisão → volta ao valor das picagens.
4. Lote numa semana com folga/falta/horas extra → resumo com aplicados/mantidos/bloqueados.
