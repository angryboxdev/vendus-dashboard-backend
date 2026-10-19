# Module: rosters

> Status: active
> Last updated: 2026-10-19

---

## What it is and what it's for (business perspective)

Novo RH → **Escalas**: modelos de turno (nome e abreviatura, uma ou mais
faixas), escalas por centro ou grupo, turnos em rascunho, publicar (cada
publicação é uma versão no histórico e avisa quem foi afetado), atribuição
em massa, avisos/bloqueios de restrições e trocas de turno com aprovação.

**Key concepts for the business:**

- **Rascunho / publicado** — só o publicado conta para o tempo planeado e a assiduidade.
- **Alterar um turno publicado** — precisa de motivo, sai logo como versão nova e o colaborador é avisado.
- **Restrições** — descanso mínimo entre turnos, máximos diário/semanal/anual (valores em Legal), sobreposição (bloqueia sempre) e ausências aprovadas; cada uma em aviso (pede confirmação) ou bloqueio.
- **Troca** — o colega aceita, a gestão aprova (ninguém envolvido aprova).
- **Área de trabalho** — Sala, Caixa, Cozinha… de cada centro (sempre disponível, opcional). A área é da atribuição concreta (o mesmo colaborador pode estar em áreas diferentes na semana); turnos antigos ficam «Sem área».
- **Plano de Cobertura** — opcional por empresa (desligado por omissão): mínimos de pessoas por centro ou área, por dia da semana e intervalo, com exceções datadas. Mostra défices; nunca bloqueia a publicação.

---

## Technical purpose

Tabelas `roster_shift_templates`, `rosters`, `roster_shifts` (rascunho +
estado publicado), `roster_publications` (append-only), `roster_swaps` —
migração `20261018100000`; `work_areas` + `roster_shifts.area_id` (`20261102100000`);
`coverage_rules` (`20261103100000`). O servidor junta o turno publicado ao teórico do
time-base (`plannedDays`) e pede o recálculo da assiduidade a cada publicação.

## Domain concepts

- `validateTemplate` — RE-15.
- `evaluate` — RE-16/RE-18: violações com severidade; foco nos dias alterados.
- Publicação: `publish` (todo o rascunho) e `publishNow` (TK-16, um turno), com versão otimista (`bumpVersion`).
- `WorkArea`, `validateAreaName`; `ShiftState.areaId` (opcional — ausente = sem área); `sameState` compara campo a campo.
- `domain/services/coverage.ts` — `CoverageRule`, `validateCoverageRule`, `rulesForDay` (exceção datada substitui as semanais do mesmo âmbito), `coverageDay` (intervalos partidos onde muda a lotação; cada pessoa conta uma vez; folgas e ausências não contam; regras sobrepostas → maior mínimo).

## Ports

### Input (use cases)

- `RostersUseCases` — modelos, escalas, turnos (adicionar, em massa, alterar, retirar), verificar, publicar, histórico, planeado, o meu horário, trocas.
- `RostersUseCases` também gere as áreas (`listAreas`, `createArea`, `updateArea`) e valida a área de cada turno (`areaFor`).
- `CoverageUseCases` — `status`, regras (`listRules`, `createRule`, `updateRule`, `deleteRule` — só com a funcionalidade ligada) e `coverage` (planeado vs. publicado do centro de uma escala).
- `addShifts` (vários turnos com horários diferentes numa operação) e `availability` (restrições para um turno hipotético, sem gravar) — usados pelo Assistente Mezza (ADR-0038).

### Output (domain dependencies)

- `PeriodGuardPort` (módulo periods): datas de períodos fechados — escritas recusadas com 409 `period_closed` (TK-17, RE-30).
- `RostersRepositoryPort`, `RostersContextPort` (regras por colaborador, ausências aprovadas, contas ↔ fichas), `RostersNotifierPort`, `RosterPublishedPort`, `RostersAuditPort`.
- `CoverageRulesRepositoryPort`, `CoverageContextPort` (`enabled` = `time_tracking.roster.coverage_enabled` da empresa via `settings.companyValue`; ausências aprovadas).

## Adapters

### Input

- `createRostersRouter` → `/api/novo-rh/rosters/*` (inclui `GET /summary?from&to`: visão macro — escalas ativas com pessoas no período, por publicar e última publicação); `POST /:id/clear-pending` (limpar numa só instrução os turnos nunca publicados de um colaborador no período; devolve os retirados) e `POST /:id/shifts/restore` (repor turnos pendentes retirados — o "desfazer" do ecrã; com a regra de sobreposição) (`hr.schedules`, Idempotency-Key obrigatório) e `/api/me/roster*` (os meus turnos publicados, trocas).
- Áreas: `GET/POST /areas`, `PATCH /areas/:id`; `areaId` em criar, em massa e `PATCH /shifts/:id`.
- Cobertura: `GET /coverage/status`, `GET/POST /coverage/rules`, `PATCH/DELETE /coverage/rules/:id` (desligado → 409 `invalid_state`), `GET /:id/coverage?from&to`.

### Output

- `SupabaseRostersRepository`, `SupabaseCoverageRulesRepository`, `rulesFromSettings`.

## Design decisions (ADR summary)

- **Colegas do turno no Portal** (2026-10-18, Portal ligado ao Novo RH): `GET /api/me/roster/shifts/:id/coworkers` — mesma escala, turno publicado com horário sobreposto (noturnos de dias vizinhos incluídos; encostar não conta), só nome curto, cargo e horário (nunca contactos nem ids; inativos não aparecem). Respeita `security.visibility.coworkers_shifts` (desligado por omissão, ADR-0030): desligado → 403 no servidor. Regras puras em `domain/services/coworkers.service.ts`; contexto `coworkersVisible`/`peopleBrief` ligado em `server.ts`.

- ADR-0030: versões publicadas; alteração pós-publicação com motivo e publicação imediata; restrições com valores Legal (D6) e severidade aviso por omissão; sobreposição bloqueia (também já em rascunho: criar, alterar e atribuição em massa recusam com 422 se o colaborador já tem turno planeado à mesma hora, em qualquer escala); trocas com aceitação do colega e aprovação da gestão; turnos dos colegas não visíveis no Portal.

- Cor do modelo (2026-10-19): `PUT /api/novo-rh/rosters/templates/:id/color` muda só a cor (hex `#RRGGBB` ou null = automática), auditado; as faixas de um modelo não se editam depois de criado. O frontend usa a paleta da escala.
- **Seletor e sobreposição** (2026-10-19): `overlapViolations` é o serviço central de disponibilidade (criar, atribuir em massa, alterar, mudar de colaborador, repor/desfazer e o Assistente): compara com os turnos planeados do colaborador em TODAS as escalas (rascunho e publicado, dias vizinhos por causa dos noturnos), ignora o próprio turno, e devolve o turno incompatível (`conflict`: escala, horário, publicado/rascunho) e o troço (`overlap`). O motor (`evaluate`) compara com o intervalo anterior que acaba mais tarde (não só o vizinho), usa as regras de cada colaborador e o foco inclui o dia seguinte. Faixas de repartidos em ordem cronológica (`segmentRanges`: a faixa depois da meia-noite é do dia seguinte) e sem se sobreporem. Depois de gravar volta a verificar (gestores em simultâneo: desfaz e recusa); folgas não duplicam. `check`/`publish` aceitam `from`/`to` (a semana visível); `GET /rosters/:id/candidates` alimenta o seletor (pertenças ao centro/grupo e turnos noutras escalas). Sem fuso nem hora de verão (hora de parede, ADR-0030).
- **Áreas de trabalho** (2026-10-19): por centro, nome único entre as ativas (sem maiúsculas/espaços), ordem definida, desativar não apaga (os turnos antigos mantêm a área). A área de um turno tem de estar ativa e ser do centro da escala (escala de grupo: qualquer centro); manter a área atual é sempre permitido; folga nunca tem área. Mudar a área de um turno publicado é uma alteração como as outras (motivo, versão nova, aviso). O estado publicado (JSONB) leva `areaId`.
- **Plano de Cobertura** (2026-10-19): funcionalidade da empresa (`time_tracking.roster.coverage_enabled`, desligada por omissão; o valor é o do perfil geral — exceções por centro/pessoa são ignoradas). Regras por centro (`areaId` null = centro inteiro) ou área, dia da semana (1–7) **ou** data (exceção que substitui as semanais desse dia e âmbito); fim ≤ início passa a meia-noite; regras sobrepostas nunca se somam (vale o maior mínimo). Contam os turnos das escalas do centro e, de escalas de grupo, os que têm uma área do centro; cada pessoa uma vez; folgas e ausências aprovadas não contam. Dia/âmbito sem regra = «Não configurado». Escala de grupo não tem cobertura. Só informa — a publicação nunca é bloqueada.

## How to test

- `npx jest --config jest.config.cjs src/modules/rosters`.

## Known gaps / open debt

- Regras em hora de parede (sem ajuste da mudança de hora).
- Sem "copiar planeamento", disponibilidade dos colaboradores, nem criação automática de escalas por centro/grupo.
- As escalas e turnos do RH atual não são migrados.
- Cobertura: turnos de escalas de grupo sem área não contam para nenhum centro; o mínimo é por pessoas (sem competências/cargos).
