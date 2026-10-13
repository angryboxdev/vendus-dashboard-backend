# Dashboard executivo: snapshot agregado, cache em memória e layout pessoal

Decidido em 2026-10-13 (Task "Visão Geral Executiva Modular"; escolhas do
utilizador: Dashboard dentro do Novo RH, só widgets com fonte real,
aniversários só dia/mês com permissão, layout guardado na base de dados).

## Contexto

A Visão geral do Novo RH passa a ser o Dashboard executivo. Precisa de ser
rápida, multiunidade e personalizável, sem criar uma segunda fonte de verdade
nem regras de negócio próprias. O projeto não tem Redis nem feature flags.

## Decisões

- **Um agregado (`OperationalSnapshot`)** em `GET /api/novo-rh/dashboard/snapshot`
  alimenta resumo "Hoje", "Requer atenção", estado da equipa, estado das
  unidades, cobertura e contagem de pedidos. É calculado a partir do painel
  (Overview), da Caixa de pedidos e das Escalas — DTO, nunca tabela. Listas
  detalhadas só a pedido (`/team`, `/birthdays`). Multiunidade: uma passagem
  no servidor, nunca um pedido por centro.
- **Cache em memória do processo** (`MemoryDashboardCache`), TTL de 45 s para
  a operação ao vivo, com chaves isoladas por organização, contexto, dia,
  métrica, versão e utilizador (o âmbito é por pessoa). Invalidação por evento:
  um middleware no `server.ts` limpa só as métricas afetadas da organização
  após escritas bem-sucedidas (marcações, ausências/caixa, escalas, solicitações).
  Com várias instâncias, cada uma tem a sua cache (o TTL limita a divergência);
  se um dia houver Redis, só muda o adaptador (`DashboardCachePort`).
- **Cobertura** = pessoa que devia trabalhar (horário/contrato) e não tem
  turno publicado na escala ativa do seu centro, sem ausência nem feriado.
  Reutiliza o teórico (time-base) e `plannedFor` (rosters); não há procura por
  turno no sistema, por isso não se inventa.
- **Layout pessoal** em `dashboard_layouts` (só metadados: widget, ordem,
  tamanho, oculto + `layout_version`). Widgets novos entram na posição padrão;
  removidos são ignorados; o layout nunca concede acesso.
- **Sem dados novos de privacidade**: aniversários só dia/mês e só com a
  permissão de campo `personal.birth_date`; tipo de ausência só nas listas de
  ausências e já mascarado pela fonte quando privado.

## Consequências

- Sem Google Reviews, vagas nem artigos até existir fonte (widgets mostram
  "não configurado" ou ficam desligados no frontend).
- Feature flags: o painel anterior continua acessível no frontend durante a
  validação, em vez de uma flag.
