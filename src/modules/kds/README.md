# Módulo: kds

> Status: ativo
> Última atualização: 2026-08-06

---

## O que é e para que serve (perspectiva de negócio)

**Kitchen Display System** — ecrã da cozinha que mostra, em tempo real, todos os pedidos activos (Vendus e plataformas de delivery) e permite à equipa gerir o estado de cada pedido (em preparo, pronto, entregue).

**O problema que resolve:**
Sem este módulo, a cozinha não tem visibilidade sobre os pedidos a chegar das plataformas (Glovo, Uber Eats, Bolt Food) nem forma de sincronizar o estado entre múltiplos ecrãs em simultâneo.

**O fluxo do ponto de vista do negócio:**

```
Plataforma / Vendus POS             Cozinha (KDS)
───────────────────────             ──────────────────────────────────────
1. Pedido chega (webhook/polling)
                                 →  2. Card aparece em todos os ecrãs
                                    3. Cook avança o status (clique/toque)
                                 ←  4. Todos os ecrãs sincronizam
                                    5. Card passa para "Finalizados"
```

**Conceitos-chave para o negócio:**

- **Delivery (pedido)** — unidade de trabalho da cozinha: tem itens, status, origem e opcionalmente uma mesa.
- **Status do pedido** — pipeline linear: `pending/received` → `cooking` → `waiting_to_delivery` → `delivered`. Pode ser revertido um passo.
- **Origem** — `Vendus` (POS local) ou plataforma AirMenu (`Glovo`, `Uber Eats`, `Bolt Food`). Pedidos das duas origens aparecem no mesmo ecrã mas são geridos de forma independente.
- **SSE stream** — canal Server-Sent Events que mantém todos os ecrãs KDS sincronizados em tempo real sem polling.

---

## Propósito técnico

Módulo que agrega pedidos de duas fontes heterogéneas (Vendus via polling REST e AirMenu via webhook SSE) e os expõe num único stream SSE para o frontend. Gere o estado em memória dos pedidos AirMenu (incluindo `deliveredAt` para calcular tempo de serviço). Não persiste dados em base de dados.

---

## Conceitos do domínio

### `Delivery`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `number` | ID único (Vendus ou `orderId` AirMenu) |
| `reference` | `number` | Referência do pedido |
| `type` | `DeliveryType` | `table \| delivery \| takeaway \| pickup` |
| `status` | `DeliveryStatus` | Estado actual do pedido |
| `source` | `string` | Origem: `"pos"`, `"Glovo"`, `"Uber Eats"`, `"Bolt Food"`, `"AirMenu"` |
| `kitchenId` | `number` | ID da cozinha (Vendus) |
| `tableId` | `number` | ID da mesa |
| `table` | `DeliveryTable \| null` | Nome da mesa |
| `items` | `DeliveryItem[]` | Itens do pedido |
| `extraInfo` | `string` | JSON com metadados extras (para AirMenu: `{ platform, airMenuOrderId, providerOrderId, enterpriseId }`) |
| `dateCreate` | `string?` | Data de criação (ISO para AirMenu, `"YYYY-MM-DD HH:MM:SS"` para Vendus) |
| `deliveredAt` | `number?` | Timestamp Unix (ms) de quando o pedido foi marcado como `delivered`. Apenas AirMenu — gerido pelo `AirMenuKdsStoreAdapter`. |

### `DeliveryStatus`

```
pending → received → cooking → waiting_to_delivery → delivered
                                                    ↘ canceled
```

Transições permitidas pelo frontend (short press = avançar, long press = reverter):

| De | Para (avançar) | Para (reverter) |
|---|---|---|
| `pending` / `received` | `cooking` | — |
| `cooking` | `waiting_to_delivery` | `pending` |
| `waiting_to_delivery` | `delivered` | `cooking` |
| `delivered` | — | `waiting_to_delivery` |

---

## Ports

### Entrada (use cases)

- `GetPendingDeliveriesPort` — `execute()` → `Delivery[]` — devolve pedidos Vendus activos.
- `UpdateDeliveryStatusPort` — `execute({ id, status })` — avança o status de um pedido Vendus via API.

### Saída (dependências do domínio)

- `DeliveryGatewayPort` — interface para buscar e actualizar pedidos Vendus:
  - `getPendingDeliveries()` → `Delivery[]`
  - `updateStatus(id, status)` → `void`
- `AirMenuKdsStorePort` — store em memória para pedidos AirMenu:
  - `add(delivery)` — upsert de um pedido (novo ou substituição)
  - `updateStatus(id, status)` → `Delivery | null` — actualiza status e gere `deliveredAt`
  - `getAll()` → `Delivery[]`
  - `subscribe(listener)` → `unsubscribe()` — notifica todos os listeners a cada mudança

---

## Adapters

### Entrada

`KdsController` expõe via REST:

| Endpoint | Auth | Descrição |
|---|---|---|
| `GET /kds/stream` | `requireDeviceAuthAllowingQueryParam` (token via query param) | SSE stream: replay do estado actual + updates em tempo real. `event: delivery` = upsert |
| `GET /kds/deliveries` | `requireDeviceAuth` (token via header) | Lista pedidos Vendus activos (polling) |
| `PATCH /kds/deliveries/:id/status` | `requireDeviceAuth` (token via header) | Actualiza status de pedido Vendus |
| `PATCH /kds/air-menu-deliveries/:id/status` | `requireDeviceAuth` (token via header) | Actualiza status de pedido AirMenu; broadcast automático via SSE |

Todas as rotas exigem um Location token válido. Um ecrã sem token, com um
token desconhecido ou com um token revogado é rejeitado com `401` —
ticket 06 removeu o fallback `UNATTENDED_SCOPE` que, durante o rollout
(tickets 01-05), deixava um ecrã ainda não emparelhado passar sem token.
`/kds/stream` é a
única rota que aceita o token via query param (`?device_token=...`) em vez do
header `X-Device-Token`, porque o `EventSource` nativo do browser não permite
headers customizados — excepção deliberada e documentada, não uma
inconsistência a "corrigir".

O SSE stream emite:
- `event: connected` — ao conectar
- `event: delivery` — por cada pedido em memória (replay) e a cada mudança futura (novo pedido ou update de status)
- `: heartbeat` — comentário SSE a cada 30 s para manter a ligação viva

### Saída

- `VendusDeliveryGateway` — implementa `DeliveryGatewayPort`. Consome a API REST do Vendus.
- `AirMenuKdsStoreAdapter` — implementa `AirMenuKdsStorePort`. Map em memória + EventEmitter interno. Gere `deliveredAt` (set ao passar para `delivered`, clear ao reverter).
- `air-menu-delivery.mapper.ts` — função pura `mapAirMenuEventToDelivery(event)` → `Delivery | null`. Mapeia `WebhookOrderEvent` (CREATED) para `Delivery`. Extrai plataforma do nome da division e `AM_PROVIDER_ORDER_ID` do campo `extraInfo` aninhado. Os nomes dos itens incluem sufixo de tamanho (`S`/`L`) — ver "Resolução de tamanho" abaixo.

---

## Bridge AirMenu → KDS

O `kds.module.ts` cria a ligação entre os dois módulos no composition root:

```
OrderEventBusPort.subscribe(event)
  → mapAirMenuEventToDelivery(event)
  → AirMenuKdsStoreAdapter.add(delivery)
  → EventEmitter.emit('change', delivery)
  → todos os SSE clients recebem event: delivery
```

Esta ligação acontece **uma vez por processo**, ao nível do módulo — não por cliente SSE. O `OrderEventBusPort` é injectado em `createKdsModule({ eventBus })` e partilhado com `createAirMenuModule` via `server.ts`.

---

## Decisões de design

- **Dois tipos de pedido, um único stream SSE**: Vendus e AirMenu têm origens e ciclos de vida diferentes, mas o frontend recebe `event: delivery` para ambos — o frontend distingue pela propriedade `source`.
- **Estado AirMenu em memória**: pedidos AirMenu chegam via webhook e não existem numa base de dados acessível. O `AirMenuKdsStoreAdapter` é o único source of truth durante a sessão do servidor. Perde-se ao reiniciar — dívida conhecida.
- **Replay ao conectar**: ao ligar ao SSE stream, o cliente recebe imediatamente o estado actual de todos os pedidos AirMenu em memória (`getAll()`). Ecrãs que se ligam tarde ou reconectam ficam sincronizados sem intervenção.
- **`deliveredAt` gerido pelo store, não pelo frontend**: o timestamp de entrega é calculado no backend (`Date.now()` no momento do `updateStatus`), propagado via SSE e sincronizado entre todos os ecrãs — sem depender do relógio do cliente.
- **`event: delivery` como upsert**: o frontend trata este evento de forma idempotente — se o pedido já existir, substitui; se não existir, adiciona. Isto simplifica o protocolo (um único evento para add e update).
- **Bridge no composition root, não no controller**: a ligação `eventBus → store` é feita em `kds.module.ts`, não no controller. O controller não sabe de onde vêm os pedidos AirMenu — só conhece o `AirMenuKdsStorePort`.
- **Heartbeat a cada 30 s**: previne que proxies e load balancers fechem a ligação SSE por inactividade.
- **Polling Vendus separado do SSE**: pedidos Vendus continuam a ser obtidos por polling (`GET /kds/deliveries`) no frontend a cada 5 s. O SSE é exclusivo para AirMenu. Esta separação mantém compatibilidade sem mudar o fluxo Vendus existente.
- **Resolução de tamanho no mapper**: `mapAirMenuEventToDelivery` usa a estrutura nested `orders[division][].childs` do payload do webhook (mesmo formato que `GetOrders`) para extrair itens com sufixo de tamanho correto (`S`/`L`), via `extractItems` de `order-item-extractor.ts`. Recorre a `simplifiedItems` (com normalização de sufixos legados) apenas como fallback quando o campo `childs` não estiver presente. Isto garante que o KDS mostra `"Honey Pepperoni L"` ou `"Tomate e Pesto S"` em vez de apenas `"Honey Pepperoni"`.
- **Sufixos legados no fallback `simplifiedItems`**: pedidos do formato anterior ao menu com opções chegam com `"Tomate e Pesto - Grande"` em `simplifiedItems`. A função `applyLegacyNormalization` converte `"- Grande"` → `L` e `"- Individual"` → `S` antes de emitir o card no KDS.

---

## Como testar

- Use cases e mapper: `jest --testPathPattern=kds`
- Integração manual — stream SSE:
  ```
  curl -N http://localhost:3000/kds/stream
  ```
- Simular pedido AirMenu (via webhook receiver no módulo air-menu):
  ```
  POST /api/air-menu/webhook/receive
  { "enterpriseId": "...", "event": "CREATED", "resource": "ORDER", "payload": { "orderId": 99, ... } }
  ```
- Avançar status de pedido AirMenu:
  ```
  PATCH /kds/air-menu-deliveries/99/status
  { "status": "cooking" }
  ```

---

## Pontos de atenção / dívidas conhecidas

- **Estado em memória**: pedidos AirMenu perdem-se ao reiniciar o servidor. Persistência em Supabase eliminaria esta limitação.
- **Token do SSE na URL**: `/kds/stream` autentica via `requireDeviceAuthAllowingQueryParam`, com verificação real por conexão (não implícita). A excepção necessária é o token ir na query string em vez do header — URLs com token podem ficar em logs de proxies/intermediários; risco aceite dado que o token é por ecrã (location), não por utilizador.
- **Pedidos Vendus não passam pelo SSE**: atualizações de status Vendus não são propagadas via SSE — cada ecrã faz polling independente. Numa próxima iteração, o `UpdateDeliveryStatusUseCase` poderia também publicar no SSE.
- **`mapAirMenuEventToDelivery` só processa `CREATED`**: eventos `MODIFIED`, `ACCEPTED` e `READY` são descartados. Tratar estas transições automatizaria parte do fluxo da cozinha.
