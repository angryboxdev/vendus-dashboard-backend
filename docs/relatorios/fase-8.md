# Relatório — Fase 8: Fecho de período e exportação

## Resumo
Está entregue o separador Novo RH → **Fecho**:
- **Períodos:** por organização ou por centro, com:
  - verificar pendentes;
  - fechar (com exceção explícita quando há pendentes);
  - fechos anteriores com as diferenças;
  - exportar;
  - pedir reabertura;
- **Reaberturas:** precisam de duas aprovações de pessoas diferentes; quem pede não aprova;
- **Transferências:** ficheiros prontos, disponíveis durante 24 h.

Fechar **congela** os dias do período. Primeiro recalcula a assiduidade e sincroniza o banco de horas, e depois guarda a fotografia dos totais por colaborador. A partir daí recusam-se, com 409, as escritas com datas desse período, nos quatro módulos:
- correções de marcação;
- ausências;
- movimentos do banco de horas;
- publicação de turnos.

O recálculo também passa a ignorar esses dias.

Decisão D10, parcial (ADR-0031):
- formato v1 para salários;
- formato v1 para faturação **por centro**.

O modelo cliente/obra não existe. Fica proposto no ADR-0032 para validação da Contabilidade e da Direção. Nada foi criado sem aprovação.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-30 | passa | `periods/__tests__/use-cases/periods.test.ts::RE_30_TK_17_*` (409 com período fechado; depois da dupla aprovação a correção passa e fica auditada) |
| TK-17 | passa | o mesmo teste (marcação, ausência e banco) + "dias congelados no recálculo"; escalas: `checkOrThrow` com a guarda |
| TK-18 | passa | `periods.test.ts::TK_18_*` (quem pede não aprova; a mesma pessoa não conta duas vezes; com 2 → reaberto) · front `TK_18_*` |
| TK-19 | passa | `periods.test.ts::TK_19_*` (totais do ficheiro = soma da fotografia = dias + movimentos; soma das horas no CSV confere) · `periods.controller.test.ts` |

Repetidos da DoD:
- **TK-5:** 634 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 50 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2885 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 425 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Faturação por cliente/obra | Por centro (v1); cliente/obra proposto | O modelo não existe; não inventar faturas | 0031, 0032 |
| Layouts do software de salários | CSV genérico v1 | A Contabilidade ainda não indicou o processador | 0031 |
| Horas por centro | Centro do colaborador em cada dia (não o da marcação) | Simplificação v1 | 0031 |
| Ficheiros | Guardados na base de dados até expirar (sem limpeza agendada) | Sem tarefas agendadas ainda | — |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D10 | Parcial: formatos v1; modelo cliente/obra **proposto** (ADR-0032) | Contabilidade/Direção validam formatos e o modelo |

## Riscos e dívida técnica
- **13 migrações por aplicar** (Fases 1–8); a nova é `20261019100000`, com rollback.
- Fechar um período com muitos colaboradores faz o recálculo de todos durante o pedido. Para centenas de pessoas, passar a uma tarefa em fila.
- A tabela de fechos (append-only) não tem teste de integração (sem Docker neste PC).

## Segurança e RGPD
- **Exportações:** o NIF só sai para quem tem `hr.sensitive_data`. As células são neutralizadas contra fórmulas. O link é por utilizador, com token, e expira em 24 h; o download não fica em cache e fica auditado.
- **Rotas:** `/api/novo-rh/periods/*` → `hr.closure`.
- **Auditoria:** criar, fechar (com exceções e somas), reabrir (pedido e aprovações) e exportar ficam na auditoria transversal.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 9, a última.
