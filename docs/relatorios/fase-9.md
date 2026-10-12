# Relatório — Fase 9: Comunicação, notificações, alertas, tarefas e relatórios

## Resumo
Foram entregues quatro separadores novos no Novo RH:

- **Comunicados:**
  - escrever e escolher o público (todos, centros, grupos ou pessoas);
  - publicar: a lista de destinatários fica **fixa**;
  - mudar o texto depois de publicado cria uma versão nova;
  - leituras por versão: entregue, lido e confirmado, com data;
  - cada colaborador vê os seus comunicados e confirma a leitura.
- **Alertas:**
  - regras para pedidos parados há N dias (ausências, correções, reaberturas, trocas, solicitações);
  - regras para contratos e períodos experimentais a terminar, e tarefas em atraso;
  - cada alerta tem dono, prazo e escalonamento quando o prazo passa;
  - fecha sozinho quando a origem fica resolvida, ou à mão, com nota.
- **Tarefas:**
  - tarefas com checklist (os itens obrigatórios têm de estar feitos) e prazo;
  - solicitações personalizadas (formulários até 50 campos), decididas pela gestão;
  - **Quem está:** por omissão, só o próprio centro, aplicado também na API.
- **Relatórios:** assiduidade, saldos, ausências, dados incompletos e histórico de alterações, no âmbito de quem consulta e com CSV.

Decisão D12 pela opção recomendada (ADR-0033): só notificações **na aplicação**. E-mail, push e WhatsApp existem como parâmetros desligados até a Direção e o DPO decidirem.

**Correção feita nesta fase:** os CSV (incluindo o de salários da Fase 8) tratavam números negativos, como "-8,00", como se fossem fórmulas e acrescentavam-lhes um apóstrofo. Agora só se neutraliza texto.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-24 | passa | `alerts/__tests__/alerts.test.ts::RE_24_*` (pendente há > 3 dias → alerta ao dono; sem duplicados; prazo passado → escala aos administradores) · front `RE_24_*` |
| RE-31 | passa | `announcements/__tests__/announcements.test.ts::RE_31_*` (lista fixa mesmo com pessoas novas) · `announcements.controller.test.ts::RE_31_http_*` (409) · trigger na base de dados |
| RE-32 | passa | `announcements.test.ts::RE_32_*` (entregue/lido/confirmado com data; versão nova pede nova confirmação) · front `RE_32_*` |
| RE-36 | passa | `alerts.test.ts::RE_36_*` (origem, dono, aberto → em tratamento → fechado com nota; fecho automático) · front `RE_36_*` |
| CF-15 | passa | `workspace/__tests__/workspace.test.ts::CF_15_*` · `workspace.controller.test.ts::CF_15_http_*` (a API não devolve colegas de outros centros) · front `CF_15_*` |

Repetidos da DoD:
- **TK-5:** 670 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 59 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2910 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 433 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Canais e-mail/push/WhatsApp | Desligados; só notificações na aplicação | D12 por decidir (DPO/Direção) | 0033 |
| Avaliação de alertas | Ao consultar (no máximo de 10 em 10 min) e a pedido; sem tarefa agendada | Ainda não existe um agendador para o Novo RH | 0033 |
| Expiração de pedidos | Não expiram sozinhos; a "expiração" é o alerta e o escalonamento | Não decidir pedidos sem uma pessoa | 0033 |
| Permissões das rotas novas | Comunicados, tarefas e relatórios em `hr.employees`; alertas em `hr.overview` (sem funções novas no catálogo) | Evitar mexer nos perfis existentes | — |
| Solicitações | Decididas pela gestão (sem fluxo multinível) | Âmbito mínimo | 0033 |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D12 | Adotada: só na aplicação | Para ativar e-mail/WhatsApp é preciso base legal, subcontratante e retenção |
| C6.7 | Visibilidade mínima por omissão | RH pode alargar o "Quem está" à organização |

## Riscos e dívida técnica
- **14 migrações por aplicar** (Fases 1–9); a nova é `20261020100000`, com rollback.
- Os relatórios são calculados a pedido; com muitos colaboradores podem ser lentos.
- O separador do Novo RH tem agora 16 entradas; vale a pena agrupá-las quando passar a principal.

## Segurança e RGPD
- **"Quem está":** devolve só nome, estado e hora, sem contactos nem centro.
- **Relatórios:** sem NIF nem IBAN; ausências privadas mascaradas; o histórico não inclui os valores "antes/depois" e exige a permissão de auditoria.
- **Rotas:**
  - `/api/novo-rh/announcements|workspace|reports` → `hr.employees`;
  - `/api/novo-rh/alerts` → `hr.overview`;
  - as do colaborador em `/api/me/*`, sempre com a ficha da sessão.
- Nenhuma notificação sai da aplicação (D12).

## Pedido de aprovação
Última fase da task. Aprovada de antemão pelo utilizador. Ver o resumo final em `docs/relatorios/novo-rh-resumo-final.md`.
