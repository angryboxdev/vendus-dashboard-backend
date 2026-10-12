# Relatório — Fase 5: Ausências, férias e fluxos de aprovação

## Resumo
Está entregue o separador Novo RH → **Ausências**:
- **Para aprovar:** a caixa de cada aprovador, com o nível do pedido e a indicação de escalonamento;
- **Pedidos:** filtrar, atribuir uma ausência e cancelar. Uma ausência aprovada só se cancela com motivo e o saldo é reposto com um movimento novo;
- **Saldos:** os movimentos de cada tipo (acumulação, ausências, anulações, ajustes, compensações), ajuste com motivo e compensação de feriados trabalhados;
- **Tipos:** cada tipo declara todas as regras. Nada vem preenchido com valores legais;
- **Fluxos de aprovação:** até 5 níveis, com pessoas, responsáveis do colaborador ou perfis, e pessoas de recurso;
- **As minhas:** saldos, pedir e cancelar pendentes.

As ausências aprovadas passam para a assiduidade:
- **"desconta do horário":** o teórico do dia baixa;
- **"conta como trabalhado":** as horas somam ao trabalhado.

Decisão D9 e restantes escolhas pela opção recomendada (ADR-0028):
- recurso = pessoas do fluxo ou administradores;
- um nível vazio **escala e alerta**, nunca aprova sozinho;
- sem autoaprovação.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-19 | passa | `absences/__tests__/use-cases/absences.test.ts::RE_19_*` (domínio e pedido) · `absences.controller.test.ts::RE_19_http_*` (422) |
| RE-20 | passa | `absences.test.ts::RE_20_dias_naturais_03_06_a_26_07_sao_54` |
| RE-21 | passa | `absences.test.ts::RE_21_*` (2,5 h; saldo 18 h → 15,5 h) · front "pedido por horas" |
| RE-22 | passa | `absences.test.ts::RE_22_*` · `absences.controller.test.ts` (o próprio → 403) |
| RE-23 | passa (escala para o recurso + alerta; **não** aprova sozinho) | `absences.test.ts::RE_23_*` |
| RE-25 | passa | `absences.test.ts::RE_25_*` (3 movimentos: −5, +5, −5; saldo 17 de 22) |
| CF-5 | passa | `absences.test.ts::CF_5_*` (forma e perfil sem ninguém) · `absences.controller.test.ts::CF_5_http_*` · front `CF_5_*` |
| CF-7 | passa | `absences.test.ts::CF_7_*` · `attendance/.../day-engine.test.ts::CF_7_*` |
| CF-8 | passa | `absences.test.ts::RE_21_CF_8_*` |
| CF-9 | passa | `absences.test.ts::CF_9_*` (sem aprovação: +1 dia; com aprovação: só depois de aprovado; sem duplicados) |
| TK-14 | passa | `absences.test.ts::TK_14_*` · `absences.controller.test.ts` (cobertura por contratos seguidos) |

Repetidos da DoD:
- **TK-5:** 590 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 38 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2830 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 408 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Nível vazio | Escala para o recurso e alerta (o observado aprovava sozinho) | Risco elevado em C6.4; RE-23 proposto | 0028 |
| Acumulação | Limite (+ antiguidade) por período, sem proporcionalidade por data de entrada | Regra legal a validar (D6) | 0028 |
| Expiração e transição | Tipos de movimento existem; não há cálculo automático | Regra legal a validar | 0028 |
| Editar pedido | Cancelar e pedir de novo | Mais simples e auditável | — |
| Anexo | Guarda a referência a um documento; carregamento pelo módulo de documentos | Reutilizar o motor de documentos | — |
| Portal | As ausências do Portal atual continuam; "As minhas" do Novo RH é para teste | Não misturar (pedido do utilizador) | 0027/0028 |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D9 | Adotada: recurso = pessoas do fluxo, senão administradores | RH pode indicar as pessoas de recurso em cada fluxo |
| D6 (licenças) | Usada: nenhum tipo criado por omissão | RH/jurídico tem de criar os tipos com os limites validados |
| D5 / C6.6 | Valores seguros: sem autoaprovação, fora do contrato sempre recusado, privadas com permissão própria | — |

## Riscos e dívida técnica
- **10 migrações por aplicar** (Fases 1–5); a nova é `20261016100000`, com rollback.
- A migração acrescenta `hr.absences_private` aos perfis Admin e RH.
- Os triggers append-only não têm teste de integração (sem Docker neste PC).
- Sem tipos e fluxos configurados não há pedidos possíveis. Isto é intencional.

## Segurança e RGPD
- **Dados novos:** pedidos de ausência (datas, tipo, comentário) e saldos.
- **Ausências privadas:** sem a permissão, aparecem como "Ausência", sem tipo nem comentário. O próprio colaborador vê sempre as suas.
- **Rotas:**
  - `/api/novo-rh/absences/*` → `hr.leave`, com âmbito por colaborador;
  - `/api/me/absences*` e `/api/me/approvals*` → Portal. A decisão exige estar no nível atual do pedido.
- **Auditoria:** criação, atribuição, decisão, cancelamento, ajustes, tipos e fluxos ficam na auditoria transversal.
- Nada se apaga: os saldos e as decisões são append-only.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 6.
