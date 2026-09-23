# Glovo Integration — Checklist

## Status
Email enviado para partner.integrationseu@glovoapp.com.
A aguardar resposta (tipicamente 2-5 dias úteis).

---

## Feito

- [x] Módulo `glovo` implementado (hexagonal, `src/modules/glovo/`)
- [x] 3 endpoints webhook registados como rotas públicas:
  - `POST /api/glovo/orders/dispatched`
  - `POST /api/glovo/orders/picked_up`
  - `POST /api/glovo/orders/cancelled`
- [x] Autenticação por Bearer token (`GLOVO_WEBHOOK_TOKEN`) com `timingSafeEqual`
- [x] Event bus em memória para futura ligação ao KDS/frontend
- [x] 4 testes unitários passam
- [x] Email de registo enviado com os 3 endpoints

---

## Quando a Glovo responder (ambiente Stage)

### 1. Adicionar variável de ambiente no Render
Nas settings do Render → Environment → adicionar:
```
GLOVO_WEBHOOK_TOKEN=<shared_token_que_eles_enviarem>
```
> Guardar também num lugar seguro (ex: password manager) — token é estático.

### 2. Adicionar ao .env.example
```
# Glovo: token estático enviado pela Glovo no header Authorization: Bearer
GLOVO_WEBHOOK_TOKEN=your-glovo-webhook-token
```

### 3. Deploy
- Fazer push para `main` (ou trigger manual no Render) para garantir que o código novo está em produção.

### 4. Testar endpoint com o token real
```bash
curl -X POST https://vendus-dashboard-backend.onrender.com/api/glovo/orders/dispatched \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <shared_token>" \
  -d '{"order_id":"test-1","store_id":"<store_id_que_eles_derem>","payment_method":"DELAYED","currency":"EUR","order_code":"TEST01","estimated_total_price":1500,"courier":{"name":"Flash"},"customer":{"name":"Waldo","hash":"h1"},"products":[],"bundled_orders":[],"is_picked_up_by_customer":false}'
```
Resposta esperada: `{"ok":true}`

### 5. Confirmar com a Glovo
- Informar a Glovo que os endpoints estão prontos e pedir que façam um teste de validação do lado deles.
- Pedir acesso ao ambiente de Stage (testglovo.com) para fazer pedidos de teste.

### 6. Definir o `store_id`
- A Glovo chama-lhe "External ID" — é o identificador único da loja **do nosso lado**.
- Decidir e comunicar à Glovo (ex: `angrybox-lisboa`, `angrybox-porto`).
- Anotar aqui o(s) valor(es) acordados:
  - Loja 1: ___________
  - Loja 2: ___________

---

## Para produção (após Stage validado)

### 7. Solicitar credenciais de produção
- Responder ao email da Glovo a pedir o token de produção.
- Adicionar novo `GLOVO_WEBHOOK_TOKEN` no Render (substituir o de stage).

### 8. Rollout coordenado com a Glovo
- A Glovo coordena o go-live com a equipa local:
  - Confirmar timings
  - Confirmar `store_id` / External IDs definitivos
  - Confirmar que auto-accept está ativo ou não (ver nota abaixo)

> **Nota auto-accept:** Se desativado, cada pedido tem de ser aceite via API
> (`PUT /webhook/stores/{storeId}/orders/{orderId}/status`). Se ativado, os
> riders são despachados imediatamente. Decidir com a operação.

---

## Próximas funcionalidades (pós go-live)

- [ ] Persistir pedidos Glovo na base de dados (Supabase)
- [ ] Ligar event bus Glovo ao KDS / SSE frontend
- [ ] Implementar `PUT /webhook/stores/{storeId}/orders/{orderId}/status` para aceitar pedidos via API
- [ ] Dashboard de pedidos Glovo no frontend
