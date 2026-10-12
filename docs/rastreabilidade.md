# Rastreabilidade — Novo RH

Liga cada requisito/teste de aceitação da task RH faseada ao código e ao
teste automatizado. Convenção de nomes dos testes: `RE_n_…`, `CF_n_…`,
`TK_n_…` (ex.: `test("TK_2_if_match_desatualizado_devolve_412")`).

Estados: **por fazer** · **parcial** · **feito** (teste automatizado a passar na CI).

Fontes: RE = `Especificacao_RH_Engenharia_Reversa` §15 · CF = `Especificacao_RH_Configuracoes` C12 · TK = task faseada §6.

> Nota: o RH atual (legado) já trata alguns destes temas (ex.: turno que
> passa a meia-noite, motivo nas correções de Assiduidade, saldos de férias).
> Isso não conta como "feito": cada ID fica feito quando o Novo RH tiver o
> teste com o ID a passar.

## Fase 0 — Preparação

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| TK-1 | CI bloqueia o merge com testes a falhar ou segredo detetado | parcial — falta tornar o job obrigatório no GitHub (admin) | `.github/workflows/ci.yml` | a própria pipeline |
| TK-2 | POST repetido com a mesma Idempotency-Key não duplica; If-Match desatualizado → 412 | feito | `src/infra/http/idempotency.ts`, `etag.ts`, `problem-details.ts` | `src/infra/http/__tests__/tk-02-write-integrity.test.ts` |

## Fase 1 — Fundação

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| TK-3 | Papel administrativo sem MFA não acede à administração | feito (backend + ecrã de ativação no Novo RH; `MFA_ENFORCEMENT` por omissão `novo-rh`) | `route-permissions.ts` (`mfaRequired`), `access-guards.ts` (`requireMfa`), front `novo-rh/adapters/in/MfaGate.tsx` | `src/modules/access/__tests__/domain/tk-03-04-mfa-sessions.test.ts`, front `MfaGate.test.tsx` |
| TK-4 | Mudar papel ou desativar revoga sessões de imediato | feito | `org_members.sessions_revoked_at`, `access-guards.ts` (`loadAccess`), `access-admin.use-cases.ts` | `tk-03-04-mfa-sessions.test.ts`, `access-admin.test.ts::TK_4_*` |
| TK-5 | Matriz papel × endpoint cobre 100% dos endpoints | feito — 500 endpoints, 0 por classificar (bloqueia a CI); resultados esperados por perfil nos endpoints do Novo RH | `src/tools/authz-matrix/` | `src/tools/authz-matrix/__tests__/authz-matrix.test.ts::TK_5_*` |
| TK-6 | Configurações com data de efeito | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` |
| TK-7 | Dependência violada → 422 `rule_violation` | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` |
| TK-8 | Dois segmentos → mesmo valor efetivo (ordem D3) | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| RE-33 | Isolamento entre tenants em todos os endpoints | parcial — estrutural na CI (todas as tabelas do Novo RH com org_id, RLS, política e helper) + teste com 2 organizações escrito, por correr (precisa do stack local) | `table-registry.ts`, migrações `*_novo_rh_*` | `src/infra/scoped-db/__tests__/re-33-novo-rh-tenant-structure.test.ts`, `re-33-novo-rh-isolation.integration.test.ts` |
| CF-1 | Cascata Global → Pessoal (chave de teste) | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| CF-12 | Alteração de configuração com antes/depois/motivo, exportável | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` (CSV) |

## Fase 2 — Pessoas e contratos

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-1 | Nome e apelido obrigatórios | feito | `src/modules/people` | `src/modules/people/__tests__/use-cases/people.test.ts::RE_1_*` |
| RE-2 | Documento duplicado → 409 | feito | `people` + índice único de NIF | `src/modules/people/__tests__/use-cases/people.test.ts::RE_2_*`, `people.controller.test.ts` |
| RE-3 | Exportação sem colunas sem permissão (IBAN) | feito | `people.use-cases.ts` (`exportCsv`) | `src/modules/people/__tests__/use-cases/people.test.ts::RE_3_*`, `people.controller.test.ts::RE_3_http_*` |
| RE-4 | Desativação revoga sessões; dados ficam nos relatórios | feito | `people` + `access-governance` (`disableLinkedUser`) | `src/modules/people/__tests__/use-cases/people.test.ts::RE_4_*` |
| RE-34 | Admin de centro não vê outros centros (pesquisa e exportação) | feito | `access` (âmbitos) + `people` (lista, ficha, exportação) | `access-governance.test.ts::RE_34_*`, `src/modules/people/__tests__/use-cases/people.test.ts::RE_34_*` |
| CF-2 | Transferência: regras do novo centro a partir da data de efeito | feito | `org-structure` (`transfer`) + settings | `src/modules/org-structure/__tests__/org-structure.test.ts::CF_2_*` |
| CF-14 | Complemento noutra moeda → recusado | feito | `employment.ts` (`compensationRuleViolation`) | `src/modules/people/__tests__/use-cases/people.test.ts::CF_14_*` |
| TK-9 | Contratos sobrepostos → 409 | feito (aplicação + trigger na BD) | `employment.use-cases.ts` | `src/modules/people/__tests__/use-cases/people.test.ts::TK_9_*` |
| TK-10 | Transferência não altera dias anteriores | feito | `org-structure` (`transfer`) | `org-structure.test.ts::TK_10_*` |

## Fase 3 — Base do tempo

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-35 | Apagar calendário mostra impacto e exige confirmação | feito | `time-base` (`deletePreview`, `deleteCalendar`) | `src/modules/time-base/__tests__/time-base.test.ts::RE_35_*` |
| CF-10 | Importação de feriados "a confirmar", não substitui regionais | feito | `time-base` (`importNational`) | `src/modules/time-base/__tests__/time-base.test.ts::CF_10_*` |
| CF-13 | Nomes de horário únicos por tenant | feito (aplicação + índice único) | `time-base` (`createSchedule`) | `src/modules/time-base/__tests__/time-base.test.ts::CF_13_*` |
| TK-11 | Teórico diário correto (casos aprovados por RH) | feito — casos propostos (fixo, flexível, feriado, versão a meio do mês, meio dia, contrato, noturno); **aprovação de RH pendente** | `theoretical.service.ts` | `src/modules/time-base/__tests__/time-base.test.ts::TK_11_*` |
| TK-12 | Dia de trabalho no fuso do centro, incl. mudança de hora (Lisboa e Madrid) | feito | `workday.service.ts` | `src/modules/time-base/__tests__/time-base.test.ts::TK_12_*` |

## Fase 4 — Registo de ponto e assiduidade

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-5 | Soma de segmentos | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| RE-6 | Meia-noite: totais iguais em todas as vistas | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| RE-7 | Noturno com margem de continuidade | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| RE-8 | Noturno com turno | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| RE-9 | Idempotência da marcação (`clientEventId`) | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/use-cases/attendance.test.ts`; `src/modules/attendance/__tests__/adapters/attendance.controller.test.ts` |
| RE-10 | Correção sem motivo → 400; com motivo cria revisão | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/use-cases/attendance.test.ts`; `src/modules/attendance/__tests__/adapters/attendance.controller.test.ts` |
| RE-11 | Recusa pelo funcionário em 48 h | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/use-cases/attendance.test.ts` |
| RE-12 | Bloqueio antes da entrada | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| RE-13 | Geofence | feito (desligado até DPIA, ADR-0027) | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts`; `src/modules/attendance/__tests__/use-cases/attendance.test.ts` |
| RE-14 | Um incidente por (funcionário, dia, tipo, origem) | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts`; `src/modules/attendance/__tests__/use-cases/attendance.test.ts` |
| CF-1 | Cascata com a tolerância real | feito | `src/modules/settings`; `src/modules/attendance` | `src/modules/settings/__tests__/use-cases/settings.test.ts`; `src/modules/attendance/__tests__/adapters/attendance.controller.test.ts` |
| CF-3 | Aviso de fecho sem fecho automático → 422 | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| CF-4 | Não desativar o único método do quiosque | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| CF-11 | Raio 200 m: 350 m recusa, 150 m aceita | feito (desligado até DPIA) | `src/modules/attendance` | `src/modules/attendance/__tests__/domain/day-engine.test.ts`; `src/modules/attendance/__tests__/use-cases/attendance.test.ts` |
| TK-13 | `attendance_day` guarda versão da configuração; recálculo gera ajuste | feito | `src/modules/attendance` | `src/modules/attendance/__tests__/use-cases/attendance.test.ts` |

## Fase 5 — Ausências, férias e aprovações

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-19 | Dia não disponível | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts`; `src/modules/absences/__tests__/adapters/absences.controller.test.ts` |
| RE-20 | Dias naturais (baixa 03/06–26/07 = 54) | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| RE-21 | Horas dentro do horário | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| RE-22 | Sem autoaprovação | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts`; `src/modules/absences/__tests__/adapters/absences.controller.test.ts` |
| RE-23 | Nível vazio escala para o fallback | feito (recurso + alerta, ADR-0028) | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| RE-25 | Saldo em ledger | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| CF-5 | Fluxo com nível sem aprovador não grava | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts`; `src/modules/absences/__tests__/adapters/absences.controller.test.ts` |
| CF-7 | Licença "descontar do horário" / "contar como trabalhado" | feito | `src/modules/absences`; `src/modules/attendance` | `src/modules/absences/__tests__/use-cases/absences.test.ts`; `src/modules/attendance/__tests__/domain/day-engine.test.ts` |
| CF-8 | Permissão por horas com interseção | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| CF-9 | Coeficiente de feriado | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts` |
| TK-14 | Ausência fora da vigência do contrato → recusada | feito | `src/modules/absences` | `src/modules/absences/__tests__/use-cases/absences.test.ts`; `src/modules/absences/__tests__/adapters/absences.controller.test.ts` |

## Fase 6 — Banco de horas

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-26 | Ledger diário | feito | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts` |
| RE-27 | Mês vencido | feito | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts` |
| RE-28 | Limite de compensação | feito (422 com o disponível) | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts`; `src/modules/time-bank/__tests__/adapters/time-bank.controller.test.ts` |
| RE-29 | Correção retroativa gera ajuste | feito | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts` |
| CF-6 | Validação de excedente não retroativa | feito | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts` |
| TK-15 | Saldo = soma dos movimentos (teste de propriedades) | feito (gerador com semente, 25 sequências) | `src/modules/time-bank` | `src/modules/time-bank/__tests__/use-cases/time-bank.test.ts` |

## Fase 7 — Escalas e turnos

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-15 | Obrigatórios do modelo de turno | feito | `src/modules/rosters` | `src/modules/rosters/__tests__/use-cases/rosters.test.ts`; `src/modules/rosters/__tests__/adapters/rosters.controller.test.ts` |
| RE-16 | Descanso mínimo com aviso ou bloqueio | feito | `src/modules/rosters` | `src/modules/rosters/__tests__/use-cases/rosters.test.ts`; `src/modules/rosters/__tests__/adapters/rosters.controller.test.ts` |
| RE-17 | Publicação notifica e guarda histórico | feito | `src/modules/rosters` | `src/modules/rosters/__tests__/use-cases/rosters.test.ts` |
| RE-18 | Conflito com férias | feito | `src/modules/rosters` | `src/modules/rosters/__tests__/use-cases/rosters.test.ts` |
| TK-16 | Alterar turno publicado exige motivo, nova versão e notificação | feito | `src/modules/rosters` | `src/modules/rosters/__tests__/use-cases/rosters.test.ts`; `src/modules/rosters/__tests__/adapters/rosters.controller.test.ts` |

## Fase 8 — Fecho de período e exportação

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-30 | Correção em período fechado → 409; reabertura com dupla aprovação | feito | `src/modules/periods`; attendance; absences; time-bank; rosters | `src/modules/periods/__tests__/use-cases/periods.test.ts` |
| TK-17 | Fecho bloqueia escritas dentro do período | feito | `src/modules/periods`; attendance; absences; time-bank; rosters | `src/modules/periods/__tests__/use-cases/periods.test.ts` |
| TK-18 | Reabertura com 2 aprovadores distintos, nenhum o requerente | feito | `src/modules/periods` | `src/modules/periods/__tests__/use-cases/periods.test.ts` |
| TK-19 | Totais exportados = soma dos dias e movimentos | feito | `src/modules/periods` | `src/modules/periods/__tests__/use-cases/periods.test.ts`; `src/modules/periods/__tests__/adapters/periods.controller.test.ts` |

## Fase 9 — Comunicação, alertas, tarefas e relatórios

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-24 | Pedido pendente há mais de N dias gera alerta | por fazer | | |
| RE-31 | Destinatários imutáveis depois de publicar | por fazer | | |
| RE-32 | Relatório entregue/lido/confirmado com data e versão | por fazer | | |
| RE-36 | Alerta com ciclo completo | por fazer | | |
| CF-15 | Visibilidade só do próprio centro (UI e API) | por fazer | | |
