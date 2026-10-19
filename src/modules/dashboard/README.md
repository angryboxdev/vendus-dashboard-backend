# Module: dashboard

> Status: active
> Last updated: 2026-10-13

---

## What it is and what it's for (business perspective)

O Dashboard executivo do Novo RH: a primeira tela do dono, gerente geral e
gestores. Em poucos segundos mostra quantas unidades estão a funcionar, quais
precisam de atenção, como está a equipa hoje, turnos sem cobertura e pedidos
por tratar — e deixa abrir o detalhe de cada número.

**The problem it solves:**
A informação estava espalhada (painel, caixa de pedidos, escalas) e cada ecrã
fazia os seus pedidos; o dono não tinha uma vista única nem multiunidade.

**The flow from the business's point of view:**

```
Gestor                                 Sistema
──────────────────────               ──────────────────────
1. Abre o Novo RH                →   2. Mostra o resumo "Hoje" e as exceções
3. Clica "2 ausentes"            →   4. Abre a lista (só quem pode ver)
5. Personaliza a ordem/tamanhos  →   6. Guarda só o layout dessa pessoa
```

## Technical purpose

Agrega fontes canónicas num `OperationalSnapshot` (um pedido), com cache
isolada e invalidação por evento; serve as listas de drill-down a pedido e
guarda o layout pessoal. NÃO é fonte de verdade: não tem regras de
assiduidade, ausências, pedidos ou escalas — lê-as dos módulos donos.

## Domain concepts

- `OperationalSnapshot` — agregado do dia (equipa, cobertura, pedidos,
  atenção, unidades, feriados). DTO, nunca tabela.
- Categorias do "Estado da equipa": `working`, `remote`, `break`, `finished`
  (terminou o dia), `not_started` (por entrar), `vacation`
  (ausência de categoria `vacation`), `absent` (ausência ou falta sem
  marcação) — mapeiam estados reais do
  painel. Atrasos são sinais, não categorias. Pedidos têm orçamento de 15 s.
- Estado de uma unidade (`critical`/`attention`/`normal`) — derivado das
  métricas, nunca guardado.
- Layout (`DashboardLayout`) — só metadados visuais por utilizador.

## Ports

### Input (use cases)

- `DashboardUseCases.snapshot` — agregado por organização ou por local (âmbito do utilizador).
- `DashboardUseCases.team` — lista de uma categoria (paginada, 50).
- `DashboardUseCases.birthdays` — próximos 30 dias, só dia/mês, só com `personal.birth_date`.
- `DashboardUseCases.layout | saveLayout | resetLayout` — layout pessoal.
- Layout: cada widget guarda `order`, `span`, `hidden` e, só no `TEAM_STATUS`, `chart` opcional (`donut` | `bar` | `pie`; valores desconhecidos são descartados por `validateLayout`). A ordem padrão (`WIDGET_SPECS`, DASH-UI-05: equipa, unidades, atenção) só vale para quem nunca guardou layout — `mergeLayout` mantém a ordem guardada. Sem migração (os widgets já são JSON).

### Output (domain dependencies)

- `DashboardViewer` — quem consulta, com as fontes já filtradas pelo âmbito (painel, caixa de pedidos).
- `DashboardSourcesPort` — cobertura (horário vs. escala publicada) e datas de nascimento.
- `DashboardLayoutRepositoryPort` — `dashboard_layouts`.
- `DashboardCachePort` — cache de agregados com invalidação seletiva.

## Adapters

### Input

- `createDashboardRouter` → `/api/novo-rh/dashboard/{snapshot,team,birthdays}` (`hr.overview` READ) e `/layout` (GET/PUT/DELETE, área de gestão — pessoal). Snapshot com `Server-Timing` e log `dashboard.snapshot` (ms, acertos de cache).

### Output

- `MemoryDashboardCache` → cache em memória (TTL, chaves por organização/contexto/dia/métrica/versão/utilizador).
- `SupabaseDashboardLayoutRepository` → `dashboard_layouts` (migração `20261028100000`).

## Design decisions (ADR summary)

- ADR-0036: snapshot único, cache em memória com invalidação por evento, cobertura = horário sem turno publicado, layout em BD só com metadados.
- ADR-0037: memo de leituras por pedido GET (infra) e "Excedente de horas" da Caixa em paralelo — snapshot frio 15,1 s → 3,8 s (medido com Supabase falso, 25 ms/ida).

## How to test

- `npx jest --config jest.config.cjs src/modules/dashboard` (fakes; HTTP com express em memória).

## Known gaps / open debt

- Cache por processo (várias instâncias → caches separadas, limitadas pelo TTL).
- O painel (Overview) tem a sua própria cache de 30 s por baixo.
- Sem Google Reviews, vagas, artigos nem hierarquia região → locais (não existem fontes).
