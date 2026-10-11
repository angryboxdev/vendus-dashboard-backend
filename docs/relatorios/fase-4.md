# Relatório — Fase 4: Registo de ponto e motor de assiduidade

## Resumo
Está entregue o separador Novo RH → **Assiduidade**:
- **Dias:** totais por dia (trabalhado, teórico, diferença, pendente, noturno), marcações, correções com motivo, ajustes e recálculo;
- **Incidentes:** falta, saída esquecida, saída automática e atraso. Cada um resolve-se como corrigido, validado (as horas passam a contar) ou dispensado, sempre com comentário;
- **Pedidos de correção:** o colaborador pede e outra pessoa da gestão aprova ou recusa (com motivo);
- **O meu ponto:** picar com fila offline (sem duplicados), ver o dia, recusar uma correção da gestão dentro do prazo e pedir correções.

O motor de cálculo é **o único** que produz os totais: todas as vistas leem dele. Um dia já apurado nunca muda em silêncio. Se a configuração ou as marcações mudarem, o dia ganha uma versão nova e, quando a diferença de horas muda, fica um ajuste registado. A Fase 6 (banco de horas) vai usar esses ajustes.

Decisões D7 e D8 adotadas pela opção recomendada (ADR-0027):
- geolocalização desligada até haver DPIA;
- horas de incidentes pendentes até validação.

## Critérios de aceitação
| ID | Estado | Teste automatizado (ficheiro::nome) |
|---|---|---|
| RE-5 | passa | `attendance/__tests__/domain/day-engine.test.ts::RE_5_*` |
| RE-6 | passa | `day-engine.test.ts::RE_6_*` (pedir um dia ou dois dá o mesmo valor) |
| RE-7 | passa | `day-engine.test.ts::RE_7_*` |
| RE-8 | passa | `day-engine.test.ts::RE_8_*` |
| RE-9 | passa | `use-cases/attendance.test.ts::RE_9_*` (3 envios → 1 marcação; fila offline) · `attendance.controller.test.ts::RE_9_http_*` · front `attendance-views.test.tsx::RE_9_*` |
| RE-10 | passa | `attendance.test.ts::RE_10_*` · `attendance.controller.test.ts::RE_10_http_*` · front "correção com motivo obrigatório" |
| RE-11 | passa | `attendance.test.ts::RE_11_*` (24 h aceita; > 48 h recusa) · front `RE_11_*` |
| RE-12 | passa | `day-engine.test.ts` (bloqueio antes da entrada, IP) · `attendance.test.ts::RE_12_*` |
| RE-13 / CF-11 | passa (regra **desligada** até DPIA) | `day-engine.test.ts::CF_11_*` · `attendance.test.ts::CF_11_*` |
| RE-14 | passa | `day-engine.test.ts::RE_14_*` · `attendance.test.ts::RE_14_*` (abre uma vez e fecha-se sozinho quando corrigido) |
| CF-1 | passa | `settings.test.ts::CF_1_*` · `attendance.controller.test.ts::CF_1_*` |
| CF-3 | passa | `settings.test.ts::CF_3_*` |
| CF-4 | passa | `settings.test.ts::CF_4_*` |
| TK-13 | passa | `attendance.test.ts::TK_13_*` (versão 1 → 2 com ajuste de +1 h; sem mudanças, sem versão nova) |
| D8 | passa | `day-engine.test.ts::D8*` · `attendance.test.ts::D8_*` |

Repetidos da DoD:
- **TK-5:** 567 endpoints, 0 por classificar.
- **RE-33 (estrutural):** 33 tabelas do Novo RH, todas com `org_id`, RLS e FK composta.

**Totais:**
- Backend: 2798 testes a passar, typecheck sem erros e nenhuma violação de fronteiras entre camadas.
- Frontend: 402 testes a passar, typecheck e lint do módulo sem erros.

## Desvios à especificação
| Requisito | Desvio | Motivo | ADR |
|---|---|---|---|
| Geofence, foto, biometria | Geofence implementada mas desligada; foto e biometria fora do âmbito | D7 — exige DPIA | 0027 |
| Horas de incidentes | Pendentes até a gestão validar | D8 | 0027 |
| Quiosque e Portal | Continuam no registo atual; o "O meu ponto" do Novo RH é para teste | Não misturar os dois registos (pedido do utilizador) | 0027 |
| Marcação offline | Aceite até 24 h depois e nunca no futuro (folga de 2 min); mais antiga → pedido de correção | Evitar marcações retroativas sem controlo | — |
| Regras por período | Um pedido usa as regras do último dia do período | Simplicidade; um recálculo por dia resolve | — |
| Fuso | Fuso da organização (ainda não há fuso por centro) | Falta o campo no centro | — |

## Decisões usadas / pendentes
| ID | Estado | Impacto |
|---|---|---|
| D7 | Adotada: desligado até DPIA | O DPO tem de aprovar antes de ligar a localização |
| D8 | Adotada: pendente até validação | As saídas esquecidas não contam até a gestão validar |
| Separação de funções | Adotada | Ninguém corrige, aprova ou valida o seu próprio registo (também o administrador) |

## Riscos e dívida técnica
- **9 migrações por aplicar** (Fases 1–4); a nova é `20261015100000`, com rollback.
- Os triggers append-only e o RLS das tabelas novas não têm teste de integração (sem Docker neste PC). Validar em staging.
- Os avisos ao colaborador (correção recusável, saída automática) chegam com as notificações (Fase 9).

## Segurança e RGPD
- **Dados novos:**
  - marcações (hora, tipo, centro);
  - IP de origem (evidência);
  - coordenadas, só se a regra de localização estiver ligada e só no instante da marcação.
- IP e coordenadas **não** aparecem nas vistas (minimização).
- **Rotas:** `/api/novo-rh/attendance/*` → `hr.attendance`, com âmbito por colaborador. `/api/me/clock*` → Portal (o colaborador é sempre o da sessão).
- **Auditoria:** correções, recusas, pedidos, decisões, incidentes e recálculos ficam na auditoria transversal, com motivo.
- Nada se apaga: as marcações são append-only e as revisões só mudam o estado de recusa.

## Pedido de aprovação
Aprovado de antemão pelo utilizador ("siga sempre o recomendado… avance até o fim"). Avanço para a Fase 5.
