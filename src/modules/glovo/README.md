# Módulo: glovo

> Status: ativo
> Última atualização: 2026-09-23

## Propósito

Recebe notificações de pedidos da plataforma Glovo via webhooks HTTP. Traduz os eventos da API da Glovo para eventos de domínio internos e publica-os num event bus em memória para consumo por outros módulos (ex: KDS, frontend via SSE).

Não é responsabilidade deste módulo: persistir pedidos na base de dados, aceitar/rejeitar pedidos na Glovo, gerir o menu ou os horários da loja.

## Conceitos do domínio

- **GlovoOrder** — pedido completo enviado pela Glovo quando é criado/despachado para a loja. Contém produtos, preços (em cêntimos), dados do courier e do cliente.
- **GlovoOrderPickedUp** — notificação mínima enviada quando o courier recolheu o pedido (`order_id`, `store_id`).
- **GlovoOrderCancelled** — notificação enviada quando um pedido é cancelado, com motivo opcional (`GlovoCancellationReason`).
- **GlovoEvent** — union type dos três eventos (`ORDER_DISPATCHED | ORDER_PICKED_UP | ORDER_CANCELLED`). É o que circula no event bus.

## Ports

### Entrada (use cases)

- `HandleOrderDispatchedPort` — processa um pedido novo recebido da Glovo; publica `ORDER_DISPATCHED` no event bus.
- `HandleOrderPickedUpPort` — processa notificação de recolha; publica `ORDER_PICKED_UP` no event bus.
- `HandleOrderCancelledPort` — processa notificação de cancelamento; publica `ORDER_CANCELLED` no event bus.

### Saída (dependências do domínio)

- `GlovoEventBusPort` — canal de publicação/subscrição de `GlovoEvent`. O domínio publica; consumidores externos subscrevem via `onEvent` exposto pelo módulo.

## Adapters

### Entrada

- `GlovoController` → expõe os três use cases como rotas públicas (sem `requireAuth`):
  - `POST /api/glovo/orders/dispatched` — pedido novo (obrigatório pela Glovo)
  - `POST /api/glovo/orders/picked_up` — courier recolheu o pedido (opcional)
  - `POST /api/glovo/orders/cancelled` — pedido cancelado (opcional)

### Saída

- `InMemoryGlovoEventBus` → implementa `GlovoEventBusPort` com um `Set` de handlers em memória. Não persiste eventos — se não houver subscriber no momento da publicação, o evento perde-se.

## Decisões de design

### Autenticação por Bearer token estático

A Glovo envia `Authorization: Bearer <shared_token>` em todos os webhooks. O token é estático (não expira) e partilhado no momento do onboarding. A verificação usa `timingSafeEqual` para evitar timing attacks. Se `GLOVO_WEBHOOK_TOKEN` não estiver configurado, a verificação é ignorada — útil em stage/dev antes de receber as credenciais reais.

### Validação mínima no adapter de entrada

O controller valida apenas os campos obrigatórios (`order_id`, `store_id`) antes de delegar ao use case. Não usa biblioteca de schema (ex: Zod) por enquanto — ver dívidas conhecidas.

### Event bus em memória (sem persistência)

Os eventos são publicados em memória e perdidos se não houver subscriber. Esta é uma implementação de fase 1: suficiente para ligar ao KDS via SSE. Persistência de pedidos Glovo é trabalho futuro.

### Rotas públicas montadas antes de `requireAuth`

Os webhooks da Glovo são chamados sem sessão de utilizador. São montados em `server.ts` antes do middleware `requireAuth`, tal como o air-menu.

## Como testar

- Use cases: `npx jest --testPathPattern="src/modules/glovo" --no-coverage` (rápido, sem banco nem rede).
- Endpoint manual (requer o servidor em execução):
  ```bash
  curl -X POST http://localhost:3333/api/glovo/orders/dispatched \
    -H "Content-Type: application/json" \
    -d '{"order_id":"test-1","store_id":"store-abc","payment_method":"DELAYED","currency":"EUR","order_code":"TEST01","estimated_total_price":1500,"courier":{"name":"Flash"},"customer":{"name":"Waldo","hash":"h1"},"products":[],"bundled_orders":[],"is_picked_up_by_customer":false}'
  ```

## Pontos de atenção / dívidas conhecidas

- Sem persistência — pedidos não são guardados na base de dados. Um `ORDER_CANCELLED` não consegue verificar se o pedido foi previamente aceite.
- Validação do payload é mínima (só `order_id` e `store_id`). Deveria usar Zod ou schema equivalente para validar a forma completa do `GlovoOrder`.
- O `GlovoEventBusPort.publish` é síncrono; os use cases estão declarados `async` antecipando futura I/O (persistência), mas não há `await` ainda.
- A entidade `GlovoOrder` usa snake_case (formato wire da API Glovo). Idealmente o adapter mapearia para um domínio com camelCase próprio.
