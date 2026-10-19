# Module: google-reviews

> Status: active
> Last updated: 2026-10-14

---

## What it is and what it's for (business perspective)

Mostra no Dashboard do Novo RH a nota Google de cada local (estrelas e número
de avaliações), a média ponderada da empresa e, a pedido, as avaliações mais
recentes de um local com link para o Google.

**The problem it solves:**
O dono queria ver a reputação das unidades no mesmo ecrã da operação, sem
abrir o Google Maps local a local.

**The flow from the business's point of view:**

```
Gestor                                   Sistema
──────────────────────                 ──────────────────────
1. "Ligar locais ao Google"        →   2. Pesquisa o nome no Google e mostra candidatos
3. Escolhe o lugar certo           →   4. Guarda a ligação (auditada)
5. Abre o Dashboard                →   6. Mostra nota por local e média
```

## Technical purpose

Integra a Google Places API (New) — pesquisa (`places:searchText`), detalhes
(nota, contagem, link do Maps) e avaliações — e guarda só a ligação
local → `place_id`. A chave fica na variável de ambiente
`GOOGLE_PLACES_API_KEY` (servidor); sem ela, o módulo responde
"não configurado" e o Dashboard continua a funcionar.

## Domain concepts

- `PlaceLink` — local da organização ligado a um `place_id` público do Google.
- `LocationRating` — nota e contagem de um local; `unavailable` quando o
  Google falhou para esse local (os outros continuam).
- Média — ponderada pelo número de avaliações; locais sem avaliações não contam.

## Ports

### Input (use cases)

- `GoogleReviewsUseCases.overview` — nota por local ligado, média, locais por ligar.
- `GoogleReviewsUseCases.search` — candidatos no Google (3–120 caracteres).
- `GoogleReviewsUseCases.link | unlink` — ligar/desligar um local (auditado).
- `GoogleReviewsUseCases.reviews` — avaliações de um local ligado.

### Output (domain dependencies)

- `GooglePlacesGateway` — pesquisa, detalhes e avaliações no Google.
- `PlaceLinkRepositoryPort` — `location_google_places`.
- `LocationsSourcePort` — locais da organização (do módulo de pessoas).
- `GoogleReviewsAuditPort` — registo de auditoria.

## Adapters

### Input

- `createGoogleReviewsRouter` → `GET /api/novo-rh/google-reviews` e
  `GET …/locations/:id/reviews` (`hr.overview` READ); `GET …/search`,
  `PUT|DELETE …/locations/:id` (`company.locations` MANAGE). Erros: 409
  `not_configured`, 400 `validation`, 404 `not_found`, 502 `google_unavailable`.

### Output

- `HttpGooglePlacesGateway` → Places API (New); chave só no cabeçalho
  `X-Goog-Api-Key`, `X-Goog-FieldMask` mínima, timeout de 6 s, erros sem a chave.
- `SupabasePlaceLinksRepository` → `location_google_places` (migração `20261029100000`).

## Design decisions (ADR summary)

- Nunca guardar avaliações nem notas na BD: cache em memória de 6 h por
  lugar (reduz custo e respeita os termos do Google — atribuição do autor e
  link para o Google ao mostrar avaliações).
- A chave nunca passa pelo browser nem pelos logs.
- Ligação manual (pesquisa + escolha) em vez de adivinhar pelo nome do local.

## How to test

- `npx jest --config jest.config.cjs src/modules/google-reviews` (fakes; gateway com `fetch` falso).

- **Avaliações fictícias na Demonstração** (2026-10-19): numa organização demo (`isDemo`, com cache de 5 min) todos os locais aparecem «ligados» com nota (4,2–4,8) e número de avaliações fictícios, e `reviews` devolve as 5 mais recentes de `demo-reviews.service.ts` — determinísticas por local e hora, com avaliações novas a «chegar» ao longo do dia; nunca chama o Google. A organização real não muda.
