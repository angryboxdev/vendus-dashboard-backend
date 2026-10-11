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
| TK-5 | Matriz papel × endpoint cobre 100% dos endpoints | parcial — gerador feito (`npm run authz:matrix`, 460 endpoints, 0 não classificados); falta o teste por âmbito | `src/tools/authz-matrix/` | `src/tools/authz-matrix/__tests__/authz-matrix.test.ts` |
| TK-6 | Configurações com data de efeito | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` |
| TK-7 | Dependência violada → 422 `rule_violation` | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` |
| TK-8 | Dois segmentos → mesmo valor efetivo (ordem D3) | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| RE-33 | Isolamento entre tenants em todos os endpoints | por fazer | | |
| CF-1 | Cascata Global → Pessoal (chave de teste) | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts` |
| CF-12 | Alteração de configuração com antes/depois/motivo, exportável | feito | `src/modules/settings` | `src/modules/settings/__tests__/use-cases/settings.test.ts`, `src/modules/settings/__tests__/adapters/settings.controller.test.ts` (CSV) |

## Fase 2 — Pessoas e contratos

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-1 | Nome e apelido obrigatórios | por fazer | | |
| RE-2 | Documento duplicado → 409 | por fazer | | |
| RE-3 | Exportação sem colunas sem permissão (IBAN) | por fazer | | |
| RE-4 | Desativação revoga sessões; dados ficam nos relatórios | por fazer | | |
| RE-34 | Admin de centro não vê outros centros (pesquisa e exportação) | parcial — âmbitos e verificação feitos (Fase 1); pesquisa/exportação de colaboradores com a Fase 2 | `access/domain/services/scope.service.ts`, `access-governance.use-cases.ts` | `src/modules/access/__tests__/use-cases/access-governance.test.ts::RE_34_*` |
| CF-2 | Transferência: regras do novo centro a partir da data de efeito | por fazer | | |
| CF-14 | Complemento noutra moeda → recusado | por fazer | | |
| TK-9 | Contratos sobrepostos → 409 | por fazer | | |
| TK-10 | Transferência não altera dias anteriores | por fazer | | |

## Fase 3 — Base do tempo

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-35 | Apagar calendário mostra impacto e exige confirmação | por fazer | | |
| CF-10 | Importação de feriados "a confirmar", não substitui regionais | por fazer | | |
| CF-13 | Nomes de horário únicos por tenant | por fazer | | |
| TK-11 | Teórico diário correto (casos aprovados por RH) | por fazer | | |
| TK-12 | Dia de trabalho no fuso do centro, incl. mudança de hora (Lisboa e Madrid) | por fazer — dados de teste já gerados (`demo-data`) | | |

## Fase 4 — Registo de ponto e assiduidade

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-5 | Soma de segmentos | por fazer | | |
| RE-6 | Meia-noite: totais iguais em todas as vistas | por fazer | | |
| RE-7 | Noturno com margem de continuidade | por fazer | | |
| RE-8 | Noturno com turno | por fazer | | |
| RE-9 | Idempotência da marcação (`clientEventId`) | por fazer | | |
| RE-10 | Correção sem motivo → 400; com motivo cria revisão | por fazer | | |
| RE-11 | Recusa pelo funcionário em 48 h | por fazer | | |
| RE-12 | Bloqueio antes da entrada | por fazer | | |
| RE-13 | Geofence | por fazer | | |
| RE-14 | Um incidente por (funcionário, dia, tipo, origem) | por fazer | | |
| CF-1 | Cascata com a tolerância real | por fazer | | |
| CF-3 | Aviso de fecho sem fecho automático → 422 | por fazer | | |
| CF-4 | Não desativar o único método do quiosque | por fazer | | |
| CF-11 | Raio 200 m: 350 m recusa, 150 m aceita | por fazer | | |
| TK-13 | `attendance_day` guarda versão da configuração; recálculo gera ajuste | por fazer | | |

## Fase 5 — Ausências, férias e aprovações

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-19 | Dia não disponível | por fazer | | |
| RE-20 | Dias naturais (baixa 03/06–26/07 = 54) | por fazer | | |
| RE-21 | Horas dentro do horário | por fazer | | |
| RE-22 | Sem autoaprovação | por fazer | | |
| RE-23 | Nível vazio escala para o fallback | por fazer | | |
| RE-25 | Saldo em ledger | por fazer | | |
| CF-5 | Fluxo com nível sem aprovador não grava | por fazer | | |
| CF-7 | Licença "descontar do horário" / "contar como trabalhado" | por fazer | | |
| CF-8 | Permissão por horas com interseção | por fazer | | |
| CF-9 | Coeficiente de feriado | por fazer | | |
| TK-14 | Ausência fora da vigência do contrato → recusada | por fazer | | |

## Fase 6 — Banco de horas

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-26 | Ledger diário | por fazer | | |
| RE-27 | Mês vencido | por fazer | | |
| RE-28 | Limite de compensação | por fazer | | |
| RE-29 | Correção retroativa gera ajuste | por fazer | | |
| CF-6 | Validação de excedente não retroativa | por fazer | | |
| TK-15 | Saldo = soma dos movimentos (teste de propriedades) | por fazer | | |

## Fase 7 — Escalas e turnos

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-15 | Obrigatórios do modelo de turno | por fazer | | |
| RE-16 | Descanso mínimo com aviso ou bloqueio | por fazer | | |
| RE-17 | Publicação notifica e guarda histórico | por fazer | | |
| RE-18 | Conflito com férias | por fazer | | |
| TK-16 | Alterar turno publicado exige motivo, nova versão e notificação | por fazer | | |

## Fase 8 — Fecho de período e exportação

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-30 | Correção em período fechado → 409; reabertura com dupla aprovação | por fazer | | |
| TK-17 | Fecho bloqueia escritas dentro do período | por fazer | | |
| TK-18 | Reabertura com 2 aprovadores distintos, nenhum o requerente | por fazer | | |
| TK-19 | Totais exportados = soma dos dias e movimentos | por fazer | | |

## Fase 9 — Comunicação, alertas, tarefas e relatórios

| ID | Requisito | Estado | Código | Teste |
|---|---|---|---|---|
| RE-24 | Pedido pendente há mais de N dias gera alerta | por fazer | | |
| RE-31 | Destinatários imutáveis depois de publicar | por fazer | | |
| RE-32 | Relatório entregue/lido/confirmado com data e versão | por fazer | | |
| RE-36 | Alerta com ciclo completo | por fazer | | |
| CF-15 | Visibilidade só do próprio centro (UI e API) | por fazer | | |
