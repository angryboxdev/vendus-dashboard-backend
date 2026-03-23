# Autoconsumo Vendus (API `selfconsumption`)

Integração com **GET** `/selfconsumption/` (**Basic Auth**: utilizador = API key, password vazio — igual ao `CURLOPT_USERPWD` com só a chave nos exemplos PHP da Vendus), conforme documentação v1.1.

## Onde aparece na app

| Local                                     | Campo(s)                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/reports/monthly-summary`        | `vendus_selfconsumption` (opcional)                                                |
| `GET /api/reports/ingredient-consumption` | `vendus_selfconsumption`, `consumption_selfconsumption`, `debug.selfconsumption_*` |

Query opcional comum: **`store_id`** — filtra a listagem de autoconsumo por loja.

## Resposta agregada (`VendusSelfConsumptionSummary`)

- `date_start` / `date_end` — intervalo pedido.
- `store_id` — loja filtrada ou `null`.
- `total_spending` — total monetário reportado pela API (quando disponível).
- `records_count` — número de registos.
- `records` — cada registo inclui os campos da listagem (ex.: `id`, `consumption_datetime`, `employee_name`, `total`, `observations`, …) e **`products`**: array **normalizado** com `{ reference, title, qty }` por linha consumida.
  - A listagem do Vendus muitas vezes **não** traz produtos; o backend chama **GET `/selfconsumption/{id}/`** para cada `id` necessário (concorrência limitada, ver env abaixo).
- `details_fetched` — quantos pedidos de detalhe foram feitos (IDs únicos).
- `details_fetch_truncated` — `true` se houve mais registos sem produtos do que o limite `VENDUS_SELFCONSUMPTION_MAX_DETAIL_FETCHES` (omissão: 800); esses ficam com `products: []`.
- `pages_fetched` — páginas HTTP obtidas na listagem (paginação interna).
- `error` — mensagem se a chamada falhar (rede, 401, etc.); nesse caso `records` vem vazio.

### Variável de ambiente

| Variável | Descrição |
|----------|-----------|
| `VENDUS_SELFCONSUMPTION_MAX_DETAIL_FETCHES` | Máximo de GET de detalhe por pedido ao painel (protege a API Vendus em períodos com muitos autoconsumos). |

## Consumo de ingredientes

O autoconsumo **não** é misturado com `consumption` (vendas). As linhas de produto são extraídas dos `records`, mapeadas com `vendus_product_mapping` + receitas (modo tolerante: linhas sem mapeamento aparecem em `debug.selfconsumption_mapping_skipped`).

## Referências

- `src/services/selfconsumptionService.ts` — fetch e extração de linhas.
- `src/infra/vendusClient.ts` — `vendusGetBasic`.
