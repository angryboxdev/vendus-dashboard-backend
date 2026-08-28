# Módulo: vendus

> Status: ativo
> Última atualização: 2026-08-28

---

## O que é e para que serve (perspectiva de negócio)

Integração com o sistema de faturação **Vendus** — POS onde todas as vendas e consumos internos do negócio são registados. Serve dois propósitos distintos no dashboard:

1. **Faturação de clientes** — consultar documentos fiscais emitidos (salão, eatz/delivery, take-away) com breakdowns por canal, categoria, IVA e produto, e obter KPIs históricos de faturação.
2. **Autoconsumo de funcionários** — consultar o que os funcionários consumiram internamente (refeições de serviço, etc.) com analytics por pessoa, categoria e produto.

**O problema que resolve:**
Sem este módulo, os dados de faturação Vendus chegam ao frontend dispersos por vários endpoints legados sem tipagem, sem separação de canal e sem analytics agregados. O módulo unifica tudo numa API limpa, e expõe pela primeira vez os dados de autoconsumo de forma estruturada.

**Fluxo — Faturação de clientes:**

```
Caixa (Vendus POS)                     Dashboard
──────────────────────────             ────────────────────────────────────
1. Emite fatura (FS/FT)
   → canal Salão, Eatz               → 2. Consulta /vendus/summary
     ou Take Away                       3. Vê lista de documentos com canal
                                        4. Vê KPIs: bruto, IVA, líquido,
                                           ticket médio, top produtos,
                                           breakdowns canal/categoria/IVA
                                        5. Consulta /vendus/analytics/current
                                           → hoje vs média, projeção do mês
                                        6. Consulta /vendus/analytics/historical
                                           → evolução anual e histórica
```

**Fluxo — Autoconsumo de funcionários:**

```
Funcionário (Vendus POS)               Dashboard (gestor)
──────────────────────────             ────────────────────────────────────
1. Regista consumo interno
   (refeição de serviço, etc.)       → 2. Consulta /vendus/selfconsumption
                                        3. Vê lista de registos por pessoa
                                        4. Vê analytics: total gasto por
                                           funcionário, por categoria,
                                           top produtos consumidos
```

**Conceitos-chave para o negócio:**

- **Salão** — consumo no restaurante. Detectado pela ausência dos métodos Apps/Eatz e sem item de embalagem.
- **Eatz** — delivery próprio (marca Eatz). Detectado pelo método de pagamento Eatz (ID configurável via `VENDUS_EATZ_PAYMENT_ID`).
- **Take Away** — salão com embalagem. Agrupado com Salão na UI; sub-contado em `takeAwayCount`.
- **Apps** — delivery via plataformas externas (Glovo/Uber Eats/Bolt) faturado directamente no Vendus. **Histórico pré-AirMenu** — daqui em diante estas plataformas são integradas via AirMenu e não geram faturas Vendus com este método. Detectado pelo método de pagamento Apps (ID configurável via `VENDUS_APPS_PAYMENT_ID`). Só aparece na UI quando existem documentos com este método.
- **FS / FT** — fatura simplificada / fatura completa. Documentos de receita de clientes.
- **NC** — nota de crédito. Anula uma FS/FT; subtrai da receita.
- **Autoconsumo** — registo de consumo interno de um funcionário. Não é um documento fiscal; usa um endpoint separado da API Vendus com autenticação Basic Auth. Não entra nos totais de faturação.

---

## Propósito técnico

Módulo hexagonal que consome dois endpoints distintos da API REST Vendus e transforma as respostas no modelo de domínio interno. Não persiste dados (excepto cache de analytics mensais). Responsabilidades:

1. Listar documentos fiscais do período (com paginação transparente).
2. Buscar detalhes de documentos (items, payments, taxes) para enriquecimento com canal e categoria.
3. Carregar e cachear o catálogo de produtos (`/products/`) para lookup de categoria/preço.
4. Computar analytics consolidados de faturação (byChannel, byCategory, byVatRate, topProducts, productsByChannel, temporalDistribution).
5. Normalizar títulos de produtos pizza para exibição (`(Individual)` → `S`, `(Grande)` → `L`) de forma consistente com o AirMenu.
6. Fornecer métricas rápidas do mês (analytics/current) e históricas com cache (analytics/historical).
7. Listar e agregar registos de autoconsumo de funcionários com analytics (byEmployee, byCategory, topProducts).

Não é responsável por emitir documentos fiscais; apenas os lê e classifica.

---

## Conceitos do domínio

### Channel detection

O canal de um documento é derivado dos `payments[]` do documento detalhado:

```
payments[] contém ID do método Apps  →  'apps'
payments[] contém ID do método Eatz  →  'eatz'
items[] contém título com "embalagem" →  'take_away'
caso contrário                         →  'salao'
```

`take_away` é agrupado com `salao` em `byChannel` (contabilizado em `takeAwayCount`), mas mantido como canal separado em `productsByChannel`. `apps` só é incluído em `byChannel` se houver documentos com esse canal no período — caso contrário é omitido do array. Em `productsByChannel`, o campo `byChannel.apps` está sempre presente (pode ser 0).

### Filtro de NC

NC (notas de crédito) anulam FS/FT. O `GetSummaryUseCase` identifica quais FS foram anulados via `related_docs` das NC e exclui-os da lista. A NC fica no resultado e contribui negativamente para a receita.

### Catálogo de produtos

Carregado de `GET /products/` da Vendus. Indexado por `reference` (primário) e `title:` + título (secundário, fallback). Cache em memória TTL 10 min (`VendusProductCatalogAdapter`).

---

## Isolamento por organização (spec B2)

Este módulo converteu para a spec B2 (`.scratch/scoped-access/spec.md`,
D2/D7, ADR-0008) seguindo o padrão que `bank-accounts` (ticket 02) definiu —
mas quase todo o módulo fica **fora** desse padrão, deliberadamente: o
módulo fala sobretudo com a API HTTP do Vendus, não com o Supabase. D2
escopa o parâmetro `organizationId` a **queries construídas contra o
Supabase**; um gateway HTTP para um sistema externo não é uma dessas
queries, e adicionar-lhe `organizationId` seria inventar um parâmetro sem
significado (o Vendus não sabe o que é uma organização).

O único ponto do módulo que constrói uma query Supabase é o cache de
analytics mensais (2 métodos, `analytics_monthly_cache`). É por isso o
único port de saída, o único port de entrada e o único adapter que ganharam
`organizationId`:

- **`AnalyticsCachePort`** (saída) — `organizationId: OrganizationId` é o
  **primeiro parâmetro, separado**, em `getMonths` e `saveMonths` (D2 — nunca
  um campo dentro de um objecto de filtro).
- **`GetAnalyticsHistoricalPort`** (entrada) — o único use case que chama o
  `AnalyticsCachePort`, por isso o único cujo `GetAnalyticsHistoricalParams`
  ganhou um campo `organizationId`. Os outros cinco use cases (`GetSummaryPort`,
  `GetAnalyticsCurrentPort`, `GetDocumentDetailPort`, `ListDocumentsPort`,
  `GetSelfConsumptionPort`) não tocam o Supabase e mantêm as suas assinaturas
  inalteradas.
- **Controller** — só a rota `/vendus/analytics/historical` lê
  `req.auth!.orgId` e coloca-o no query object; as restantes rotas não
  precisam de organização nenhuma. Nunca lido do body/params, para não ser um
  valor que o cliente possa escolher.
- **`SupabaseAnalyticsCacheAdapter`** — recebe o `ScopedQueryFactory`
  (`createScopedQuery`) no construtor em vez de resolver o cliente Supabase
  internamente, e chama `this.scopedQuery(organizationId).table("analytics_monthly_cache")`
  por operação. Os outros dois adapters de saída (`VendusHttpGateway`,
  `VendusProductCatalogAdapter`) não mudam — nunca seguraram um `SupabaseClient`.
- **Domínio**: nenhuma entity ganhou um campo `organizationId` — é uma
  preocupação de acesso/query, não um invariante de negócio.

---

## Ports

### Entrada (use cases)

- `GetAnalyticsCurrentPort` — `execute(year, month)` → métricas rápidas do mês (list docs apenas, sem channel). Sem organização — não toca o Supabase.
- `GetAnalyticsHistoricalPort` — `execute({ organizationId, year, month })` → totais históricos, gráfico 6 meses, comparações (cache-aware). `organizationId` viaja dentro do `GetAnalyticsHistoricalParams` que já existia — único use case do módulo que precisa dele (ver secção acima).
- `GetSummaryPort` — `execute({ since, until })` → `{ documents, analytics }` completos com channel. Sem organização — não toca o Supabase. **Exposto via composition root para injeção noutros módulos.**
- `GetDocumentDetailPort` — `execute(id)` → documento detalhado + channel + has_drinks. Títulos de itens normalizados (S/L). Sem organização — não toca o Supabase.
- `ListDocumentsPort` — `execute(params)` → lista de documentos sem detail (rápida). Sem organização — não toca o Supabase.
- `GetSelfConsumptionPort` — `execute({ since, until })` → registos de autoconsumo normalizados + analytics (byEmployee, byCategory, topProducts). Sem organização — não toca o Supabase.

### Saída (dependências do domínio)

- `VendusGatewayPort` — `listDocuments`, `fetchDetail` — HTTP para a API Vendus. Sem organização — gateway externo, fora do escopo de D2.
- `VendusProductCatalogPort` — `getProducts()` → catálogo em Map com cache em memória. Sem organização — mesmo motivo.
- `AnalyticsCachePort` — `getMonths(organizationId, years)`, `saveMonths(organizationId, rows)` — cache de meses imutáveis. `organizationId` é sempre o primeiro parâmetro (D2) — único port de saída do módulo que constrói queries Supabase.

---

## Adapters

### Entrada

`VendusController` expõe via REST:

| Endpoint | Auth | Descrição |
|---|---|---|
| `GET /api/vendus/analytics/current?year=&month=` | manager+ | Métricas rápidas do mês |
| `GET /api/vendus/analytics/historical?year=&month=` | manager+ | Total anual, histórico, gráfico crescimento |
| `GET /api/vendus/summary?since=YYYY-MM-DD&until=YYYY-MM-DD` | manager+ | Docs + analytics completos (N+1 detail fetches) |
| `GET /api/vendus/documents?since=&until=[&type=&per_page=&page=]` | manager+ | Lista rápida de documentos |
| `GET /api/vendus/documents/:id` | manager+ | Detalhe com channel e has_drinks |
| `GET /api/vendus/selfconsumption?since=YYYY-MM-DD&until=YYYY-MM-DD` | manager+ | Autoconsumo com analytics por funcionário/categoria |

### Saída

- `VendusHttpGateway` — implementa `VendusGatewayPort` via `vendusClient.ts` (infra partilhada).
- `VendusProductCatalogAdapter` — implementa `VendusProductCatalogPort`. Fetch paginado de `/products/`, TTL cache 10 min, mapeia category_id → Category via `VENDUS_CATEGORY_MAP`.
- `SupabaseAnalyticsCacheAdapter` — implementa `AnalyticsCachePort`, via `ScopedQueryFactory` (D2) — não guarda um `SupabaseClient`. Lê/escreve tabela `analytics_monthly_cache`. Falhas são não-fatais.

---

## Decisões de design

- **Normalização de títulos pizza (`product-title-normalizer.ts`)**: os produtos pizza são configurados no Vendus com sufixo de tamanho em parênteses — `"Honey Peperoni (Individual)"` / `"Chicken & Cheese (Grande)"`. A função `normalizeProductTitle` converte `(Individual)` → `S` e `(Grande)` → `L`, para exibição consistente com o AirMenu. É aplicada em três sítios: `analytics-calculator.service.ts` (topProducts / productsByChannel), `GetSummaryUseCase` (items nos documents devolvidos ao frontend), e `GetDocumentDetailUseCase` (items no detalhe do documento). A detecção de categoria (`detectCategory`) usa o título raw antes da normalização — não é afectada.
- **Channel por payment method, não por preço**: a detecção de canal anterior (comparação de preço unitário com price groups) foi substituída pela presença do método de pagamento. Ordem de prioridade: Apps (`VENDUS_APPS_PAYMENT_ID`) → Eatz (`VENDUS_EATZ_PAYMENT_ID`) → embalagem → salão. Mais simples, mais robusta, sem necessidade de `legacy_prices`.
- **Canal `apps` condicional**: o canal `apps` representa faturação histórica de plataformas externas (Glovo/Uber Eats/Bolt) directamente no Vendus, antes da integração AirMenu. Só aparece em `byChannel` quando existem documentos com esse canal — meses sem Apps não mostram a linha na UI.
- **`VENDUS_CATEGORY_MAP` como constante de domínio**: os IDs de categoria Vendus são estáveis por instalação. Mantidos em `vendus-product.ts` com comentário. Alternativa (env/config) considerada mas rejeitada por complexidade desnecessária.
- **`price-map.json` deixa de ser lido pelo novo módulo**: `price_group_ids` migram para env vars (`VENDUS_PRICE_GROUP_SALAO`, `VENDUS_PRICE_GROUP_EATZ`). `legacy_prices` removidos (obsoletos com o novo channel detection). O ficheiro é mantido para os módulos legados que ainda o usam.
- **Dois endpoints distintos**: `/analytics/current` (rápido, list docs) vs `/summary` (completo, detail docs + channel). Evita N+1 no dashboard principal.
- **Routes legadas em paralelo**: `/api/analytics/*`, `/api/documents`, `/api/reports/monthly-summary` continuam activas até o frontend migrar para `/api/vendus/*`.
- **`getSummary` exposto pelo composition root**: para injeção futura no `cash-closings` module sem importar o adapter diretamente.
- **`take_away` como sub-canal**: mantido no domínio como canal distinto. Em `byChannel` é agrupado com `salao` (apenas dois canais na UI de faturação). Em `productsByChannel` é exposto separado — necessário para o cálculo de CMV por canal, onde take-away tem custos de embalagem distintos do salão.

---

## Configuração (variáveis de ambiente)

| Variável | Default | Descrição |
|---|---|---|
| `VENDUS_EATZ_PAYMENT_ID` | `275787588` | ID do método de pagamento Eatz |
| `VENDUS_APPS_PAYMENT_ID` | `355967761` | ID do método de pagamento Apps (histórico pré-AirMenu) |
| `VENDUS_PRICE_GROUP_SALAO` | `275787593` | ID do price group de salão |
| `VENDUS_PRICE_GROUP_EATZ` | `290759644` | ID do price group de eatz/delivery |

Os defaults correspondem à instalação actual (Angry Box). Se o Vendus recriar os price groups, actualizar as env vars.

---

## Como testar

```bash
# Todos os testes do módulo (9 suites, ~130 testes)
npx jest src/modules/vendus --no-coverage
```

Testes disponíveis por área:

| Ficheiro | Cobre |
|---|---|
| `__tests__/services/channel-detector.service.test.ts` | Lógica de detecção de canal (apps / eatz / salao / take_away, prioridades) |
| `__tests__/services/category-detector.service.test.ts` | Lookup por ID, heurística de título, `detectCategory` completo |
| `__tests__/services/analytics-calculator.service.test.ts` | Cálculo de analytics (byChannel, byCategory, topProducts, productsByChannel por canal, temporal) |
| `__tests__/services/product-title-normalizer.test.ts` | Conversão `(Individual)` → `S`, `(Grande)` → `L`; case-insensitive; títulos não-pizza inalterados |
| `__tests__/use-cases/get-summary.use-case.test.ts` | Orquestração de detail fetches, filtro de NC, canal por documento, normalização de títulos |
| `__tests__/use-cases/get-analytics-current.use-case.test.ts` | Período corrente vs passado, daysElapsed, projeção, by_weekday |
| `__tests__/use-cases/get-analytics-historical.use-case.test.ts` | Cache hit/miss, annual/historical totals, growth chart, comparações |
| `__tests__/use-cases/get-selfconsumption.use-case.test.ts` | Detail fetch de fallback, normalização, analytics de autoconsumo |
| `__tests__/use-cases/get-document-detail.use-case.test.ts` | Channel + has_drinks derivados; lookup por catálogo; normalização de títulos |

Integração manual:
```
GET /api/vendus/analytics/current?year=2026&month=8
GET /api/vendus/analytics/historical?year=2026&month=8
GET /api/vendus/summary?since=2026-08-01&until=2026-08-03
GET /api/vendus/documents?since=2026-08-01&until=2026-08-01
GET /api/vendus/documents/362347763
GET /api/vendus/selfconsumption?since=2026-08-01&until=2026-08-31
```

---

## Pontos de atenção / dívidas conhecidas

- **N+1 fetches em `/vendus/summary`**: para cada documento da lista é feito um fetch de detalhe. Para períodos longos (ex: mês completo com 800+ docs) pode ser lento. **Pós-MVP: avaliar cache de detalhes em Supabase ou pré-processamento via cron.**
- **`VENDUS_CATEGORY_MAP` hardcoded**: se novas categorias forem criadas no Vendus, adicionar manualmente em `vendus-product.ts` e no README. Pós-MVP: carregar categorias via `GET /categories/` da API Vendus.
- **VAT rate por produto não disponível no `/products/`**: o IVA por item vem do campo `tax.rate` do documento detalhado. O catálogo não expõe taxa de IVA por produto — confirmar se a API Vendus disponibiliza este campo num endpoint de produtos.
- **Routes legadas activas em paralelo**: `/api/analytics/*`, `/api/documents`, `/api/reports/monthly-summary` — remover após migração completa do frontend para `/api/vendus/*`.
