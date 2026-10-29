# Conferência de assiduidade: decisão de conferência por dia

Decidido em 2026-10-29 (task «Mezza RH V2 — Simplificação da Assiduidade», pré-visualização aprovada pelo utilizador: «aprovo pode integrar e avançar»).

## Contexto

A conferência estava espalhada por cinco sub-vistas (Dia da equipa, Dias,
Incidentes, Pedidos de correção, Pausas). «Cumpriu horário» só existia no
frontend: gerava várias revisões seguidas, sem atomicidade, contava o
intervalo de um turno repartido como trabalho e misturava a decisão do
gestor com as correções às picagens (que o colaborador pode recusar — RE-11).
Não havia estado «revisto» por dia.

## Decisão

1. **Uma decisão de conferência por dia** (`attendance_day_reviews`), com
   quatro decisões mutuamente exclusivas: `fulfilled` (cumpriu o horário
   planeado), `keep` (manter a marcação original), `manual` (entrada/saída/pausa
   de um dia) e `absence` (ausência registada ou falta injustificada).
   Guarda quem, quando, motivo, abrangência (`day`/`selected`/`week`), lote,
   versão do dia vista, a fotografia antes (segundos, teórico, faixas planeadas)
   e o tempo validado.
2. **Os quatro conceitos ficam separados**: picagem original (`clock_events`,
   intocada), planeado (escala publicada / horário), decisão (esta tabela) e
   tempo validado (`validated_seconds`).
3. **O motor continua a ser a única fonte**: a decisão ativa entra no
   resultado de `computeDays` dentro de `compute()` (`applyReview`) e na
   impressão da configuração do dia. Assim cada decisão cria versão nova do dia
   e, se o excedente mudar, um movimento de ajuste (TK-13). Vistas, relatórios,
   fecho e banco de horas veem o mesmo valor sem código à parte.
4. **«Cumpriu» valida o teórico do planeado** (segmentos e pausas do
   planeamento), nunca uma média; nunca reduz horas extra reais; nunca num
   turno em curso, dia futuro, folga, ausência, período fechado ou sem
   planeado. Exige a declaração do gestor quando muda horas.
5. **O servidor volta a classificar** cada dia com as mesmas regras do ecrã e
   devolve `applied / kept / skipped(motivo)`. Num lote, sem picagens, picagem
   única, correção manual e ausência com trabalho registado vão para revisão
   individual.
6. **Concorrência**: índice único parcial (uma decisão ativa por dia) e
   verificação opcional da versão gravada que o gestor viu (`changed`).
7. **Anular nunca apaga** (`voided_*`); o dia volta ao calculado e pode ser
   conferido de novo.
8. **Ausências**: o tipo de ausência é atribuído primeiro pelo módulo de
   ausências (regras, saldos e permissão `hr.leave` de sempre); a decisão
   `absence` só confirma. Sem tipo = falta injustificada confirmada.

## Alternativa rejeitada

Gerar revisões a partir da escala (sem migração): mantinha a decisão
escondida em revisões recusáveis pelo colaborador, sem estado «revisto» e
sem atomicidade.

## Consequências

- Migração `20261210100000_attendance_day_reviews.sql` (rollback em
  `docs/migrations/rollback/`).
- Rotas `GET /api/novo-rh/attendance/conference`,
  `POST …/conference/apply`, `POST …/conference/reviews/:id/void`
  (`hr.attendance`; Idempotency-Key obrigatório nos POST).
- O planeado passa à assiduidade também as faixas (`plannedRanges`), folga e
  feriado (informativo; fora da impressão do dia — não gera versões novas).
- As ações rápidas do frontend (`DayQuickActions`) foram retiradas: a decisão
  só existe no painel da Conferência.
- Noturno validado: «cumpriu» não recalcula as horas noturnas (ficam as das
  picagens) — dívida registada.
