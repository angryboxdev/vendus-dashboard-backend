# Relatório — Fase 3: Base do tempo (horários e calendários)

## Resumo
Está entregue o separador Novo RH → **Tempo**:
- horários fixos e flexíveis, com versões por data (uma versão nova fecha a anterior na véspera);
- calendários de feriados por centro, com coeficiente de compensação. A importação dos feriados nacionais de PT fica "a confirmar" e nunca substitui os regionais;
- calendários de férias, só a configuração e sem limite por omissão (os saldos chegam na Fase 5);
- atribuições com vigência, pela mesma ordem de prioridade das configurações: pessoal > grupo > departamento > centro;
- **tempo teórico diário**;
- dia de trabalho calculado no fuso do centro.

A D6 foi aplicada (ADR-0026): os parâmetros legais existem no domínio "Legal" sem valor e marcados "a validar". As opções C3.10 (forma de contar o teórico e jornadas noturnas) estão no motor de configurações.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-35 | passa | `src/modules/time-base/__tests__/time-base.test.ts::RE_35_*` · front `time-views.test.tsx::RE_35_*` |
| CF-10 | passa | `time-base.test.ts::CF_10_importacao_fica_a_confirmar_e_nao_substitui_regionais` |
| CF-13 | passa | `time-base.test.ts::CF_13_dois_horarios_com_o_mesmo_nome_sao_recusados` |
| TK-11 | passa (casos propostos; **aprovação de RH pendente**) | `time-base.test.ts::TK_11_*` (fixo, flexível, feriado, versão a meio do mês, meio dia) + modo contrato + noturno |
| TK-12 | passa | `time-base.test.ts::TK_12_dia_local_e_duracao_real_em_lisboa_e_madrid_nos_dias_de_mudanca_de_hora` |

Repetidos da DoD:
- **TK-5:** 552 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 26 tabelas do Novo RH.

**Totais:**
- Backend: 2747 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 394 testes a passar e typecheck sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Valores legais | Criados sem valor; as regras que deles dependem não se aplicam até serem preenchidos | D6 | 0026 |
| Feriados de Espanha | Sem cálculo automático; acrescentam-se à mão, com a fonte oficial | Não inventar datas | 0026 |
| Feriado "a confirmar" | Não tira o dia ao tempo teórico; aparece como aviso | Opção mais segura | 0026 |
| Pausas (C4.2), horas categorizadas | Ficam para a Fase 4 | Pertencem ao apuramento | — |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D6 | Usada: sem valores, "a validar" | Limites legais não são verificados até RH/jurídico os preencherem |
| D7 (geolocalização/foto/biometria) | **Recomendado e adotado na Fase 4:** desligado até haver DPIA | — |
| D8 (horas de incidentes) | **Recomendado e adotado na Fase 4:** pendente até aprovação (C10 #4) | — |

## Riscos e dívida técnica
- 8 migrações por aplicar (Fases 1–3).
- Os casos do TK-11 precisam de aprovação de RH.

## Segurança e RGPD
- Não há novos dados pessoais.
- Novos endpoints em `/api/novo-rh/time/*`, classificados assim:
  - horários, atribuições e tempo teórico: `hr.schedules`;
  - feriados: `company.holidays`;
  - férias: `hr.leave`.
- O tempo teórico de um colaborador respeita o âmbito de quem o consulta.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 4.
