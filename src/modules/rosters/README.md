# Module: rosters

> Status: active
> Last updated: 2026-10-12

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

---

## Technical purpose

Tabelas `roster_shift_templates`, `rosters`, `roster_shifts` (rascunho +
estado publicado), `roster_publications` (append-only), `roster_swaps` —
migração `20261018100000`. O servidor junta o turno publicado ao teórico do
time-base (`plannedDays`) e pede o recálculo da assiduidade a cada publicação.

## Domain concepts

- `validateTemplate` — RE-15.
- `evaluate` — RE-16/RE-18: violações com severidade; foco nos dias alterados.
- Publicação: `publish` (todo o rascunho) e `publishNow` (TK-16, um turno), com versão otimista (`bumpVersion`).

## Ports

### Input (use cases)

- `RostersUseCases` — modelos, escalas, turnos (adicionar, em massa, alterar, retirar), verificar, publicar, histórico, planeado, o meu horário, trocas.
- `addShifts` (vários turnos com horários diferentes numa operação) e `availability` (restrições para um turno hipotético, sem gravar) — usados pelo Assistente Mezza (ADR-0038).

### Output (domain dependencies)

- `PeriodGuardPort` (módulo periods): datas de períodos fechados — escritas recusadas com 409 `period_closed` (TK-17, RE-30).
- `RostersRepositoryPort`, `RostersContextPort` (regras por colaborador, ausências aprovadas, contas ↔ fichas), `RostersNotifierPort`, `RosterPublishedPort`, `RostersAuditPort`.

## Adapters

### Input

- `createRostersRouter` → `/api/novo-rh/rosters/*` (inclui `GET /summary?from&to`: visão macro — escalas ativas com pessoas no período, por publicar e última publicação); `POST /:id/clear-pending` (limpar numa só instrução os turnos nunca publicados de um colaborador no período; devolve os retirados) e `POST /:id/shifts/restore` (repor turnos pendentes retirados — o "desfazer" do ecrã; com a regra de sobreposição) (`hr.schedules`, Idempotency-Key obrigatório) e `/api/me/roster*` (os meus turnos publicados, trocas).

### Output

- `SupabaseRostersRepository`, `rulesFromSettings`.

## Design decisions (ADR summary)

- **Colegas do turno no Portal** (2026-10-18, Portal ligado ao Novo RH): `GET /api/me/roster/shifts/:id/coworkers` — mesma escala, turno publicado com horário sobreposto (noturnos de dias vizinhos incluídos; encostar não conta), só nome curto, cargo e horário (nunca contactos nem ids; inativos não aparecem). Respeita `security.visibility.coworkers_shifts` (desligado por omissão, ADR-0030): desligado → 403 no servidor. Regras puras em `domain/services/coworkers.service.ts`; contexto `coworkersVisible`/`peopleBrief` ligado em `server.ts`.

- ADR-0030: versões publicadas; alteração pós-publicação com motivo e publicação imediata; restrições com valores Legal (D6) e severidade aviso por omissão; sobreposição bloqueia (também já em rascunho: criar, alterar e atribuição em massa recusam com 422 se o colaborador já tem turno planeado à mesma hora, em qualquer escala); trocas com aceitação do colega e aprovação da gestão; turnos dos colegas não visíveis no Portal.

- Cor do modelo (2026-10-19): `PUT /api/novo-rh/rosters/templates/:id/color` muda só a cor (hex `#RRGGBB` ou null = automática), auditado; as faixas de um modelo não se editam depois de criado. O frontend usa a paleta da escala.
## How to test

- `npx jest --config jest.config.cjs src/modules/rosters`.

## Known gaps / open debt

- Regras em hora de parede (sem ajuste da mudança de hora).
- Sem "copiar planeamento", disponibilidade dos colaboradores, nem criação automática de escalas por centro/grupo.
- As escalas e turnos do RH atual não são migrados.
