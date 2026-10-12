# Relatório — Fase 7: Escalas e turnos

## Resumo
Está entregue o separador Novo RH → **Escalas**:
- **Escala:** grelha de 2 semanas por escala (centro ou grupo):
  - clicar num dia vazio põe o modelo escolhido;
  - os turnos por publicar aparecem tracejados;
  - atribuição em massa;
  - publicar;
  - histórico de versões;
- **Modelos de turno:** nome e abreviatura obrigatórios; uma ou mais faixas; plantão;
- **Trocas:** a gestão aprova depois de o colega aceitar;
- **O meu horário:** turnos publicados e propostas de troca.

Publicar cria uma versão, guarda o antes e o depois de cada turno e avisa os colaboradores afetados. Alterar ou retirar um turno já publicado exige motivo e sai logo como versão nova, com aviso.

O motor de restrições verifica:
- descanso mínimo;
- máximos diário, semanal e anual;
- sobreposição (bloqueia sempre);
- ausências aprovadas.

Os valores vêm do domínio Legal. Sem valor, a regra não se aplica (D6). A severidade é configurável. Por omissão é **aviso**, que exige confirmação explícita. O turno publicado passa a ser o tempo planeado desse dia, e cada publicação pede o recálculo da assiduidade.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-15 | passa | `rosters/__tests__/use-cases/rosters.test.ts::RE_15_*` · `rosters.controller.test.ts::RE_15_http_*` · front `RE_15_*` |
| RE-16 | passa | `rosters.test.ts::RE_16_*` (16–22 + 22–04: descanso violado; bloqueio recusa, aviso pede confirmação) · `rosters.controller.test.ts::RE_16_http_*` (422/409) · front `RE_16_*` |
| RE-17 | passa | `rosters.test.ts::RE_17_*` (versões 1→2, notificação aos afetados, histórico com o antes/depois; rascunho não conta) |
| RE-18 | passa | `rosters.test.ts::RE_18_*` (férias aprovadas: aviso; com bloqueio, recusa) |
| TK-16 | passa | `rosters.test.ts::TK_16_*` (sem motivo → 400; com motivo → versão 2, notificação, auditoria; retirar idem) · front `TK_16_*` |

Repetidos da DoD:
- **TK-5:** 621 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 46 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2870 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 420 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Severidade por omissão | Aviso com confirmação (o observado não avisava) | O mínimo seguro sem impor bloqueios ainda não validados | 0030 |
| Sobreposição | Bloqueia sempre | Dois turnos ao mesmo tempo nunca são válidos | 0030 |
| Turnos dos colegas no Portal | Não visíveis por omissão | Privacidade | 0030 |
| Mudança de hora | As regras usam a hora de parede | Diferença máxima de 1 h em 2 dias por ano | 0030 |
| Copiar planeamento, disponibilidade, escalas automáticas, IA | Não incluídos | Fora do âmbito mínimo da fase | — |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D6 | Usada: descanso e máximos só com valor em Legal | RH/jurídico preenche os valores |
| Severidades | Aviso por omissão (configurável por regra) | RH decide quando bloquear |

## Riscos e dívida técnica
- **12 migrações por aplicar** (Fases 1–7); a nova é `20261018100000`, com rollback.
- O histórico de publicações (append-only) não tem teste de integração (sem Docker neste PC).
- As escalas do RH atual não foram migradas; as duas convivem até o Novo RH passar a principal.

## Segurança e RGPD
- Não há novos dados pessoais além dos turnos.
- **Rotas:** `/api/novo-rh/rosters/*` → `hr.schedules`, com âmbito na atribuição. `/api/me/roster*` → Portal (só os meus turnos publicados e as minhas trocas).
- Ninguém envolvido numa troca a aprova.
- Alterações publicadas, trocas, modelos e escalas ficam na auditoria transversal.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 8.
