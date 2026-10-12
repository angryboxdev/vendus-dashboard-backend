# Relatório — Fase 6: Banco de horas

## Resumo
Está entregue o separador Novo RH → **Banco de horas**:
- **KPIs:** saldo, compensado em descanso, compensado pago e expirado;
- **Corte:** a mês vencido por omissão;
- **Ledger:** um movimento por dia, com o acumulado ao segundo;
- **Excedente por validar**, quando a validação está ligada;
- **Compensar** em descanso ou pago. O campo nunca passa do máximo disponível;
- **Ajustar**, com motivo;
- **Sincronizar**;
- **Horas categorizadas:** janelas horárias com fator multiplicador.

O banco não recalcula o passado: lê os dias apurados pela assiduidade, o único motor de totais. Cada dia fechado gera um movimento. Uma correção posterior gera um **ajuste com a data de hoje**, com referência ao dia corrigido.

Decisão D11 pela opção recomendada (ADR-0029):
- a mês vencido;
- sem limite de horas pagas e sem expiração por omissão (os 80 h / 720 dias observados são valores do fornecedor);
- horas negativas nunca expiram.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-26 | passa | `time-bank/__tests__/use-cases/time-bank.test.ts::RE_26_*` (sequência observada +2h01m42s → +4h02m35s → +4h02m49s) · front `RE_26_RE_29_*` |
| RE-27 | passa | `time-bank.test.ts::RE_27_*` (a 11/10 só até 30/09; "até ontem" inclui outubro) |
| RE-28 | passa (422 com o disponível; no ecrã o campo fica limitado) | `time-bank.test.ts::RE_28_*` · `time-bank.controller.test.ts::RE_28_http_*` · front `RE_28_*` |
| RE-29 | passa | `time-bank.test.ts::RE_29_*` (histórico igual; ajuste de −30 min datado de hoje; sem duplicados) |
| CF-6 | passa | `time-bank.test.ts::CF_6_*` (ligada a 01/11: outubro entra, novembro espera; depois de validar entra) |
| TK-15 | passa | `time-bank.test.ts::TK_15_*` (25 sequências aleatórias com semente: saldo = soma; cada dia = valor do motor) |

Repetidos da DoD:
- **TK-5:** 601 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 41 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2851 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 414 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Teste de propriedades | Gerador com semente próprio (sem `fast-check`) | Não introduzir dependências sem aprovação | — |
| Sincronização automática | Últimos 92 dias até ao corte; correções mais antigas entram com "Sincronizar" e período | Desempenho | 0029 |
| Feriado | Por omissão compensa em dias (CF-9); em modo horas: trabalhado × (coeficiente − 1) | Evitar contar duas vezes | 0029 |
| Pedido de compensação pelo colaborador | Não incluído; só a gestão lança | Âmbito da fase | — |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D11 | Adotada: mês vencido; sem limites nem expiração por omissão; multiplicadores por categoria | RH/jurídico define limites e validade |
| C6.5 | Validação de excedente desligada por omissão, com data de efeito | Ligar não altera o passado |

## Riscos e dívida técnica
- **11 migrações por aplicar** (Fases 1–6); a nova é `20261017100000`, com rollback.
- Os triggers append-only não têm teste de integração (sem Docker neste PC).
- A expiração é calculada na sincronização (sem tarefa agendada); os avisos de vencimento chegam na Fase 9.

## Segurança e RGPD
- Não há novos dados pessoais além dos saldos de horas.
- **Rotas:** `/api/novo-rh/time-bank/*` → `hr.attendance`, com âmbito por colaborador. `/api/me/time-bank` só responde se a regra "colaborador vê o histórico" estiver ligada.
- Ninguém compensa, ajusta ou valida o seu próprio banco.
- Compensações, ajustes, validações e categorias ficam na auditoria transversal.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 7.
