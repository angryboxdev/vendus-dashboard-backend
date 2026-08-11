# Módulo: air-menu

> Status: ativo
> Última atualização: 2026-08-11

---

## O que é e para que serve (perspectiva de negócio)

Integração com a plataforma **AirMenu** — agregador que centraliza pedidos de múltiplas plataformas de entrega (Glovo, Uber Eats, Bolt Food) num único ponto. Permite consultar, no dashboard, todos os pedidos recebidos por enterprise com indicação da plataforma de origem, itens, valor e tipo de documento fiscal, e obter **KPIs e breakdowns analíticos/contabilísticos** sobre as vendas de delivery.

**O problema que resolve:**
Sem este módulo, os pedidos de delivery estariam dispersos por três plataformas distintas e seria impossível ter uma visão consolidada das vendas, dos documentos fiscais emitidos e dos indicadores contabilísticos (IVA, ticket médio, breakdowns por categoria e plataforma).

**O fluxo do ponto de vista do negócio:**

```
Plataforma (Glovo/Uber/Bolt)        Dashboard
────────────────────────────        ────────────────────────────────────
1. Cliente faz pedido
2. AirMenu recebe e agrega       →  3. Filtra por enterprise e período
                                    4. Vê lista de faturas/notas de crédito
                                    5. Vê KPIs: bruto, IVA, líquido,
                                       ticket médio, top itens,
                                       breakdowns plataforma/categoria/IVA

Webhook (tempo real — KDS)
──────────────────────────────────────────────────────────────────────
1. Pedido chega na plataforma
2. AirMenu notifica via webhook  →  3. Backend publica no OrderEventBus
                                    4. KDS recebe via SSE e mostra o card
                                    5. Cozinha actualiza status do card
                                    6. SSE propaga a todos os ecrãs ligados
```

**Conceitos-chave para o negócio:**

- **Enterprise** — unidade de negócio configurada no AirMenu (ex.: "Angry Box - Porto"). Cada enterprise corresponde a um conjunto de canais de venda (divisões).
- **Divisão (division)** — canal de venda específico dentro de uma enterprise (ex.: "Angry Box - Porto #|# Angry Box #|# Glovo"). O nome codifica a hierarquia e a plataforma.
- **Fatura** — ordem entregue com sucesso, com flag `FATURAR` e sem flag `CANCEL`.
- **Nota de crédito** — ordem que foi cancelada (flag `CANCEL` presente).
- **Catálogo de menu** — mapeamento de PLU → categoria + taxa de IVA, carregado da enterprise "Angry Box - Menu" via `GetMenu`. Usado para enriquecer os itens dos pedidos no cálculo de analytics.

---

## Propósito técnico

Adapter de saída que consome a API REST da AirMenu (autenticação por sessão + API key) e transforma a resposta no modelo de domínio interno. Não persiste dados — é sempre consultado em tempo real. Responsabilidades:

1. Listar enterprises configuradas.
2. Buscar e consolidar ordens de um período → `AirMenuOrder[]`.
3. Carregar o catálogo de menu (PLU → categoria + IVA) e mantê-lo em cache.
4. Computar analytics consolidados (KPIs, breakdowns, distribuição temporal) e devolver ordens + analytics numa única resposta (`/summary`).

Não é responsável por emitir documentos fiscais; apenas classifica o tipo de documento que a ordem representa.

---

## Conceitos do domínio

### `AirMenuOrder`

| Campo | Tipo | Descrição |
|---|---|---|
| `orderId` | `string` | ID da ordem na AirMenu |
| `platform` | `string` | Plataforma derivada do divisionName (`Glovo`, `Uber Eats`, `Bolt Food`) |
| `divisionName` | `string` | Nome completo da divisão (canal de venda) |
| `orderDate` | `Date` | Timestamp de criação da ordem |
| `documentDate` | `Date` | Data relevante para contabilidade: data do `FATURAR` (faturas) ou `CANCEL` (NC) |
| `paymentMethod` | `string` | Método de pagamento |
| `items` | `AirMenuOrderItem[]` | Itens do pedido |
| `total` | `number` | Soma dos itens; negativo para notas de crédito |
| `activeFlags` | `AirMenuFlag[]` | Linha do tempo de ações sobre a ordem |
| `providerOrderId` | `string \| null` | ID na plataforma de origem (`AM_PROVIDER_ORDER_ID`) |
| `documentType` | `'invoice' \| 'credit_note'` | Derivado dos `activeFlags` |
| `extraInfo` | `Record<string, string>` | Campos extra da API |
| `rawData` | `Record<string, unknown>[]` | Payload bruto da API — **não incluído em `/summary`**, disponível via `/orders/:orderId/raw` |

### `AirMenuOrderItem`

| Campo | Tipo | Descrição |
|---|---|---|
| `title` | `string` | Nome do item com sufixo de tamanho quando aplicável (ex.: `"Honey Pepperoni L"`, `"Tomate e Pesto S"`, `"Brigadeiro Grande"`). Ver regra 6. |
| `plu` | `string` | Código PLU do item base (ex.: `"ITM-4138583"`). Vazio para add-ons sem PLU |
| `price` | `number` | Preço unitário já incluindo o custo do upgrade de tamanho quando aplicável |
| `count` | `number` | Quantidade |

### `AirMenuMenuItem`

Representa um item do catálogo de menu (carregado via `GetMenu`).

| Campo | Tipo | Descrição |
|---|---|---|
| `plu` | `string` | Código PLU — chave de lookup |
| `title` | `string` | Nome no menu |
| `category` | `string` | Família AirMenu (ex.: `"Classics"`, `"Specials"`, `"Sweeties"`, `"Drinks"`) |
| `parentCategory` | `string` | Categoria de negócio (via `CATEGORY_PARENT_MAP`; ex.: `"Pizzas"` para `"Classics"`, `"Specials"` e `"Sweeties"`) |
| `vatRate` | `number` | Taxa de IVA como fracção (ex.: `0.23`, `0.13`, `0`). Herda da família pai se não definida no item |

### `AirMenuAnalytics`

Objecto de resultado da secção `analytics` do endpoint `/summary`. Ver secção "Endpoint /summary" para o shape completo.

---

## Regras de negócio invariantes

1. O `total` é sempre recalculado no domínio a partir dos `items` — nunca vem da API. Ordens com `documentType === 'credit_note'` têm `total` negativo.
2. O `platform` é derivado do `divisionName` por heurística de substring (`glovo`, `uber`, `bolt`).
3. Uma ordem com múltiplas divisões no mesmo `orderId` é **consolidada numa única `AirMenuOrder`** — os itens são agregados.
4. O `documentDate` é a data contabilisticamente relevante: data da flag `FATURAR` para faturas, data da flag `CANCEL` para notas de crédito. Se a flag não tiver timestamp, usa-se `orderDate`.
5. A categoria e o IVA de um item são obtidos pelo **lookup de PLU** no catálogo de menu. Se o PLU estiver vazio (complementos de pizza como bebidas add-on), o `computeAnalytics` faz um segundo lookup por título (strip do prefixo `"+ "` e comparação case-insensitive via índice invertido `buildTitleIndex`). Se o título também não constar do catálogo, a categoria cai em `"Outros"` e o IVA fica `0`.
6. **Resolução de tamanho dos itens** — o `extractItems` em `order-item-extractor.ts` aplica a seguinte prioridade (a primeira que match vence):
   1. **Complement "Dobre a sua pizza"** (`/dobre|dobrar/i`): se tiver `complementItem` com "Upgrade para L" → sufixo `L` (preço do upgrade somado ao base); se o `complementItem` estiver ausente → sufixo `S` (sem custo extra). O nó complement não aparece como linha separada.
   2. **Complement "Tamanho/Size"** (`/tamanho|size/i`): o título da opção seleccionada é fundido no título do item e o seu preço somado ao preço base. Também não aparece como linha separada.
   3. **Sufixo legado no título** (`"- Grande"` → `L`, `"- Individual"` → `S`): para pedidos do formato anterior ao menu com opções. O sufixo é removido e substituído por `L`/`S`.
   4. **Default por família de pizza**: se nenhum dos anteriores se aplicar e o item estiver dentro de uma família `Classics`, `Specials` ou `Sweeties` → sufixo `S`. Resolve o caso em que o AirMenu omite o nó complement quando o upgrade não foi seleccionado.
   5. **Sem tamanho**: itens fora de famílias de pizza e sem complement de tamanho (ex.: bebidas, sobremesas não-pizza) não recebem sufixo.

   Outros add-ons pagos (complementos que não são de tamanho) continuam a aparecer como linhas `+ Nome`.
7. **`topItems` retorna todos os itens** (sem limite), ordenados por receita bruta descendente. Itens do mesmo PLU mas com tamanhos diferentes são entradas distintas (chave = `plu|title`).

---

## activeFlags — semântica completa

Os `activeFlags` são a linha do tempo de ações sobre uma ordem. Cada flag tem `key`, `operator` e `datetime` (ms).

| key | Significado |
|---|---|
| `ACCEPT` | Ordem aceite (por operador ou `script@airmenu.com` automaticamente) |
| `FATURAR` | Gatilho de faturação — a ordem deve gerar fatura fiscal |
| `PRINT` | Ordem impressa na cozinha |
| `READY` | Pronta para levantamento / entrega |
| `PICKING_UP` | Estafeta a caminho |
| `PICKED` | Levantada pelo estafeta |
| `FINISHED` | Concluída |
| `DENY` | Rejeição de um passo operacional — **não é cancelamento da ordem** |
| `CANCEL` | Cancelamento — indica nota de crédito |

**Regra de derivação do tipo de documento:**

```
activeFlags contém CANCEL               →  credit_note
activeFlags contém FATURAR, sem CANCEL  →  invoice
nenhum dos dois                         →  filtrado (não aparece na listagem)
```

*Observado com dados reais (Angry Box - Porto, últimos 7 dias):* `DENY` aparece em ordens que terminaram normalmente em `FINISHED` — confirma que não é cancelamento.

---

## Fluxo de chamadas à API AirMenu

### Autenticação

A API usa sessões temporárias válidas por 30 min (o `SessionManagerService` renova com margem de 25 min para evitar expirações em voo).

```
Authenticate(username, password)  →  { sessionId }
```

### Busca de ordens (2 passos obrigatórios)

```
1. GetOrderIds(sessionId, enterpriseId, startDate_ms, endDate_ms)
   → { orderIds: ["123", "456", ...] }

2. Para cada orderId (em paralelo):
   GetOrders(sessionId, enterpriseId, orderId)
   → { orders: { "NomeDivisão": [orderItemInstance, ...] } }
```

O `GetOrders` retorna por divisão, não por ordem diretamente. O use case consolida por `orderId` com um `Map`.

### Catálogo de menu

```
GetMenu(sessionId, enterpriseId, divisionId)
→ { menu: [ árvore de famílias e itens ] }
```

**Nota de configuração:** o catálogo de menu vive na enterprise **"Angry Box - Menu"** (`enterpriseId: "1783676282104"`) com `divisionId: ""` (vazio). Esta combinação devolve o menu completo partilhado. Está hardcoded em `AirMenuMenuCatalogAdapter` porque as outras enterprises não têm menu configurado na API — apenas recebem ordens. Ver `adapters/out/air-menu-menu-catalog.adapter.ts`.

### Estrutura do menu (`GetMenu`)

A resposta é uma árvore de nós com `menuRelation`:
- `"family"` — categoria (ex.: `"Salties"`, `"Bebidas"`, `"Menu"` estrutural)
- `"item"` — produto individual, tem `plu`, `price`, `tax` (taxa IVA em %)
- `"complement"` — grupo de opção (ex.: "Tamanho das doces")
- `"complementItem"` — opção individual (ex.: "Grande") — pode ter `price`
- `"enterprise"` — wrapper estrutural de enterprise (sem itens)

**Categorias actuais:** `Classics`, `Specials`, `Sweeties`, `Drinks`.

O `walkMenu` usa o título da **primeira família com nome real** (não-estrutural) encontrada na hierarquia como categoria. Famílias chamadas `"Menu"` são tratadas como wrappers estruturais e ignoradas. Isto garante que sub-famílias dentro de `"Salties"` não substituem `"Salties"` como categoria dos seus itens.

O `tax` propaga-se da família para os itens filhos (`activeTax`): se um item não tiver `tax` definido directamente, herda o `tax` da família pai mais próxima que o tenha. Isto é necessário porque no AirMenu o IVA pode estar configurado ao nível da família (ex.: "Sweeties") e não em cada item individualmente.

---

## Ports

### Entrada (use cases)

- `GetEnterprisesPort` — `execute()` → `AirMenuEnterprise[]`
- `GetSummaryPort` — `execute(enterpriseId, startDate, endDate)` → `{ orders: AirMenuOrder[], analytics: AirMenuAnalytics }`
- `GetOrderRawPort` — `execute(enterpriseId, orderId)` → `Record<string, unknown>[]`
- `RegisterWebhookPort` — `execute(input)` → `AirMenuWebhook` — regista um webhook na API AirMenu para uma enterprise.

`GetOrdersPort` existe internamente como dependência de `GetSummaryUseCase` — não é exposto no controller.

### Saída (dependências do domínio)

- `AirMenuGatewayPort`:
  - `authenticate(username, password)` → sessão
  - `getOrderIds(sessionId, enterpriseId, startDate_ms, endDate_ms)` → `string[]`
  - `getOrders(sessionId, enterpriseId, orderId)` → mapa divisão → instâncias
  - `getMenu(sessionId, enterpriseId, divisionId)` → `RawMenuNode[]`
  - `createWebhook(input)` → `CreateWebhookResult` — cria webhook via `ACTION=CreateWebhook`
- `MenuCatalogPort` — `getMenuItems(enterpriseId)` → `Map<plu, AirMenuMenuItem>`
- `OrderEventBusPort` — pub/sub em memória de eventos de webhook recebidos:
  - `publish(event)` — emite um `WebhookOrderEvent` para todos os subscribers
  - `subscribe(listener)` → `unsubscribe()` — regista listener; retorna função de cleanup

---

## Adapters

### Entrada

`AirMenuController` expõe via REST:

| Endpoint | Auth | Descrição |
|---|---|---|
| `GET /api/air-menu/enterprises` | ✅ | Lista enterprises configuradas |
| `GET /api/air-menu/summary?enterpriseId=&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | ✅ | Ordens + analytics do período numa única chamada (sem `rawData`) |
| `GET /api/air-menu/orders/:orderId/raw?enterpriseId=` | ✅ | Payload bruto da API para uma ordem específica (on-demand) |
| `POST /api/air-menu/webhook/register` | ✅ | Regista um webhook na AirMenu para uma enterprise |
| `POST /api/air-menu/webhook/receive` | ❌ público | Recebe notificações da AirMenu (chamado pela AirMenu, não pelo frontend) |
| `GET /api/air-menu/webhook/stream` | ❌ público | SSE stream de eventos de webhook (usado internamente; o KDS usa `/kds/stream`) |

Os endpoints públicos (`/webhook/receive` e `/webhook/stream`) são registados **antes** do middleware `requireAuth` em `server.ts` via `publicRouter`.

### Saída

- `AirMenuHttpGateway` — implementa `AirMenuGatewayPort`. Todas as chamadas usam o padrão `?ACTION=X&VERSION=1.0.0&KEY=...&DATA={...}` com resposta `RESULT={...json...}`.
- `AirMenuMenuCatalogAdapter` — implementa `MenuCatalogPort`. Carrega o catálogo via `GetMenu` e mantém-no em cache em memória por 1 hora. Ver nota de configuração acima.
- `OrderEventBusAdapter` — implementa `OrderEventBusPort`. Wrapper fino sobre `EventEmitter` do Node. Partilhado entre o módulo `air-menu` (que publica) e o módulo `kds` (que subscreve) via injeção no composition root (`server.ts`).

---

## Endpoint /summary — shape da resposta

`GET /api/air-menu/summary?enterpriseId=&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

```jsonc
{
  "orders": [
    {
      "orderId": "9876543",
      "platform": "Uber Eats",
      "divisionName": "Angry Box Porto #|# Angry Box #|# Uber Eats",
      "orderDate": "2026-08-03T13:22:00.000Z",
      "documentDate": "2026-08-03T13:25:00.000Z",
      "paymentMethod": "Online",
      "items": [
        { "title": "Honey Pepperoni L", "plu": "ITM-4138583", "price": 25.90, "count": 1 }
      ],
      "total": 16.90,
      "firstName": "João",
      "lastName": "Silva",
      "activeFlags": [{ "key": "FATURAR", "operator": "script@airmenu.com", "datetime": 1722688800000 }],
      "providerOrderId": "UE-12345",
      "documentType": "invoice",
      "extraInfo": {}
      // rawData NÃO incluído — usar /orders/:orderId/raw
    }
  ],
  "analytics": {
    "summary": {
      "totalOrders": 42,
      "totalCancellations": 3,
      "cancellationRate": 6.67,
      "grossRevenue": 1234.50,
      "vatCollected": 45.20,
      "netRevenue": 1189.30,
      "averageTicket": 29.39
    },
    "byPlatform": [
      {
        "platform": "Uber Eats",
        "orderCount": 25,
        "cancellationCount": 1,
        "grossRevenue": 800.00,
        "vatCollected": 30.00,
        "netRevenue": 770.00,
        "averageTicket": 32.00
      }
    ],
    "byCategory": [
      {
        "category": "Pizzas",
        "itemsSold": 58,
        "grossRevenue": 900.00,
        "vatCollected": 0,
        "netRevenue": 900.00,
        "subcategories": [
          { "category": "Specials", "itemsSold": 30, "grossRevenue": 500.00, "vatCollected": 0, "netRevenue": 500.00 }
        ]
      }
    ],
    "byVatRate": [
      { "rate": 23, "grossRevenue": 45.00, "vatAmount": 8.41, "netRevenue": 36.59 },
      { "rate": 13, "grossRevenue": 200.00, "vatAmount": 23.01, "netRevenue": 176.99 },
      { "rate": 0,  "grossRevenue": 989.50, "vatAmount": 0, "netRevenue": 989.50 }
    ],
    "byDocumentType": {
      "invoices":    { "count": 42, "grossRevenue": 1280.00 },
      "creditNotes": { "count": 3,  "grossRevenue": 45.50 }
    },
    "topItems": [
      {
        "plu": "ITM-4138583",
        "title": "Honey Pepperoni L",
        "category": "Specials",
        "vatRate": 0,
        "quantitySold": 12,
        "grossRevenue": 310.80
      }
    ],
    "temporalDistribution": [
      { "period": "14:00", "orderCount": 5, "grossRevenue": 180.00 }
      // todos os buckets do range incluídos (mesmo com orderCount=0)
    ]
  }
}
```

**Cálculo de IVA:** `vatAmount = gross - gross / (1 + vatRate)`. O IVA é sempre extraído do preço bruto (preço já inclui IVA).

---

## Decisões de design

- **Endpoint único `/summary`**: ordens e analytics são calculados numa única passagem pelo servidor — o frontend faz 1 chamada HTTP em vez de 2, e o backend faz 1+N chamadas à AirMenu em vez de 2+2N. `GetSummaryUseCase` recebe `GetOrdersPort` e `MenuCatalogPort`, chama ambos em `Promise.all` e passa os resultados a `computeAnalytics` diretamente.
- **`rawData` lazy-loaded**: o payload de `/summary` omite `rawData` (que pode ter vários KB por ordem). Os dados brutos são acessíveis on-demand via `GET /orders/:orderId/raw`, chamado apenas quando o utilizador abre o drawer de detalhe.
- **Dois passos obrigatórios para ordens**: a API AirMenu não suporta busca direta por período em `GetOrders` — é necessário `GetOrderIds` primeiro. Os `GetOrders` são feitos em `Promise.all` para paralelismo.
- **Consolidação por `orderId`**: o `GetOrders` agrupa por divisão; uma ordem pode aparecer em múltiplas divisões. O use case usa `Map<orderId, ...>` para garantir unicidade.
- **`documentType` derivado, não armazenado**: calculado a partir dos `activeFlags` em runtime — não existe campo direto na API.
- **`documentDate` vs `orderDate`**: a data contabilisticamente relevante é a da flag `FATURAR` ou `CANCEL`, não a da criação da ordem.
- **Catálogo de menu separado da lógica de ordens**: o `GetSummaryUseCase` depende de `MenuCatalogPort` (output port), não do gateway directamente. O adapter faz o enriquecimento PLU → categoria/IVA.
- **Cache do catálogo por 1 hora**: o menu não muda com frequência; chamá-lo por cada request seria desnecessário.
- **Enterprise dedicada para o menu**: a enterprise `"1783676282104"` ("Angry Box - Menu") com `divisionId: ""` é a única combinação que devolve o catálogo completo. As restantes enterprises devolvem estruturas vazias ou de enterprise. Hardcoded com comentário em `AirMenuMenuCatalogAdapter`.
- **`walkMenu` usa a primeira família real**: famílias chamadas `"Menu"` são wrappers estruturais e ignoradas na determinação da categoria.
- **Analytics computados no backend**: o frontend recebe dados já calculados, sem precisar de processar a lista raw de ordens.
- **Comissão de plataforma omitida do backend**: a estimativa de comissão (default 30%) é um cálculo do frontend, configurável pelo utilizador.
- **`getSummary` exposto pelo composition root**: `createAirMenuModule` retorna `{ router, getSummary, eventBus }`. O `getSummary` é injectado no módulo `cash-closings` para obter totais de delivery na submissão de fechos de caixa — sem duplicar a lógica de sessão ou catálogo.
- **`eventBus` exposto pelo composition root**: o `OrderEventBusAdapter` é criado em `createAirMenuModule` e partilhado com o módulo `kds` via `server.ts`. Isto garante que o mesmo bus é usado pelo publisher (webhook receiver) e pelo subscriber (KDS bridge) — sem acoplamento direto entre módulos.
- **Webhook receiver público, sem auth**: o endpoint `POST /api/air-menu/webhook/receive` é chamado pela AirMenu directamente — não pelo frontend autenticado. Registado antes de `requireAuth` via `publicRouter` em `server.ts`.
- **`RegisterWebhookUseCase` inclui `sessionId` automaticamente**: o use case obtém a sessão válida via `SessionManagerService` e injeta o `sessionId` no input — o caller não precisa de gerir sessões.
- **Resolução de tamanho extraída para `order-item-extractor.ts`**: toda a lógica de determinação do tamanho de um item (complement "Dobre", complement "Tamanho/Size", sufixo legado, default por família) vive em `domain/services/order-item-extractor.ts` e é partilhada entre `GetOrdersUseCase` e o mapper KDS (`air-menu-delivery.mapper.ts`). Este ficheiro é a única fonte de verdade das regras de tamanho — adicionar um novo padrão (ex.: nova família de pizza) é feito aqui e propaga-se automaticamente para ambos os contextos.
- **`PIZZA_FAMILY_RE = /classics|specials|sweeties/i`**: famílias configuradas como categorias de pizza. Items sem indicação de tamanho dentro destas famílias assumem `S` por default. A AirMenu omite o nó complement quando o upgrade não é seleccionado — este default resolve o caso silencioso.
- **Títulos com trailing space**: o AirMenu pode enviar títulos com espaço no final (ex.: `"Tomate e Pesto "`). O extractor faz `.trim()` antes de construir o título final.
- **`topItemMap` chaveado por `resolvedPlu|rawTitle`**: a mesma SKU pode ter tamanhos diferentes — usar apenas o PLU como chave agregaria tamanhos indevidamente. `resolvedPlu` usa o PLU do item quando presente, ou o PLU resolvido via catálogo pelo título quando o item é um complemento sem PLU. `rawTitle` é o título sem o prefixo `"+ "`. Isto garante que o mesmo produto (ex.: Coca-cola) agregue numa única linha independentemente de ter sido pedido standalone ou como add-on de pizza.
- **Herança de `tax` na família**: o `walkMenu` propaga `activeTax` pela árvore do menu. Necessário porque no AirMenu o IVA pode estar configurado ao nível da família e não em cada item individualmente.

---

## Configuração (variáveis de ambiente)

| Variável | Descrição |
|---|---|
| `AIRMENU_API_KEY` | Chave de API fixa por instalação |
| `AIRMENU_USERNAME` | Utilizador para `Authenticate` |
| `AIRMENU_PASSWORD` | Password para `Authenticate` |
| `AIRMENU_ENTERPRISES` | Enterprises no formato `id:nome\|id:nome` |
| `AIRMENU_WEBHOOK_URL` | URL pública onde a AirMenu entrega notificações (`POST /api/air-menu/webhook/receive`) |
| `AIRMENU_WEBHOOK_SECRET` | Secret opcional para validação de assinatura do payload (header ainda a confirmar com suporte AirMenu) |

Enterprises configuradas actualmente:

| ID | Nome |
|---|---|
| `1783676282102` | Angry Box |
| `1783676282104` | Angry Box - Menu *(fonte do catálogo de menu)* |
| `1783676282106` | Angry Box - Porto |
| `1785509161620` | Angry Box - Porto (teste) |

---

## Como testar

Todos os testes unitários: `jest --testPathPattern=air-menu`

| Ficheiro | Cobre |
|---|---|
| `__tests__/entities/air-menu-order.test.ts` | Derivação de `documentType`, `documentDate` e `total` na entidade |
| `__tests__/use-cases/get-analytics.use-case.test.ts` | `computeAnalytics` — summary, byPlatform, byVatRate, byCategory, topItems, temporalDistribution |
| `__tests__/use-cases/get-orders.use-case.test.ts` | `derivePlatform`, extracção de itens, complement "Dobre" (L/S), default S por família de pizza, sufixo legado, add-ons pagos, consolidação de divisões, filtro por `documentDate` |
| `__tests__/services/session-manager.service.test.ts` | Re-autenticação, sessão válida em cache, deduplicação de chamadas concorrentes |
| `__tests__/use-cases/register-webhook.use-case.test.ts` | Passagem de sessionId e campos ao gateway |

- Integração manual — summary:
  ```
  GET /api/air-menu/summary?enterpriseId=1783676282106&startDate=2026-08-01&endDate=2026-08-03
  ```
- Integração manual — raw data de uma ordem:
  ```
  GET /api/air-menu/orders/9876543/raw?enterpriseId=1783676282106
  ```
- Registar webhook (requer token de manager):
  ```
  POST /api/air-menu/webhook/register
  { "enterpriseId": "1785509161620", "url": "https://<ngrok-ou-prod>/api/air-menu/webhook/receive" }
  ```
- Simular recepção de webhook (sem auth):
  ```
  POST /api/air-menu/webhook/receive
  { "enterpriseId": "...", "event": "CREATED", "resource": "ORDER", "payload": { ... } }
  ```

---

## Pontos de atenção / dívidas conhecidas

- **`divisionId` do menu hardcoded**: a combinação `enterpriseId="1783676282104"` + `divisionId=""` está hardcoded em `AirMenuMenuCatalogAdapter`. Idealmente seria configurável por enterprise no env (`AIRMENU_ENTERPRISES=id:nome:menuDivisionId`), mas a dinâmica de discovery via `GetEnterpriseDivisionIds` não funciona para este caso (as enterprises de produção não têm menu configurado individualmente).
- **`orderLimitReached`**: se o período tiver muitas ordens, o `GetOrderIds` pode retornar `orderLimitReached: true` — o resultado estaria truncado silenciosamente. Não está tratado.
- **Sessão em idle longo**: o `SessionManagerService` renova a sessão por demanda. Se não houver pedidos durante mais de 25 min, a primeira chamada seguinte aguarda a renovação. Aceitável em produção.
- **Encoding latin-1**: a API pode retornar nomes com acentos em latin-1 em alguns casos. O gateway usa `fetch` que assume UTF-8 — pode haver corrupção em edge cases.
- **Header de assinatura do webhook por confirmar**: a verificação HMAC-SHA256 está implementada em `AirMenuController.verifySignature` e é chamada quando `AIRMENU_WEBHOOK_SECRET` está definido. O que não foi confirmado com o suporte AirMenu é o nome exacto do header que enviam (assumido `X-AirMenu-Signature`).
- **Estado do webhook perde-se ao reiniciar**: o `AirMenuKdsStoreAdapter` (no módulo `kds`) é em memória — pedidos AirMenu em curso são perdidos num restart do servidor. Persistência em Supabase é um próximo passo possível.
- **Eventos `MODIFIED`/`ACCEPTED` ignorados**: o mapper descarta tudo que não seja `CREATED`. Tratar `ACCEPTED` → status `cooking` e `READY` → `waiting_to_delivery` é um próximo passo para automatizar transições no KDS.
