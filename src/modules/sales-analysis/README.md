# Module: sales-analysis

> Status: active
> Last updated: 2026-11-21

---

## What it is and what it's for (business perspective)

A gerência quer saber **quando** a loja vende: por dia, por hora, por dia da
semana, que dias e horas são fortes ou fracos, e como o período compara com o
ano anterior e o mês anterior. A página «Análise de Vendas» (grupo Operação)
responde a isso, com detalhe até à hora de um dia concreto e uma previsão do
fim do mês feita com IA.

**The problem it solves:** a informação estava espalhada (Vendus, Air Menu,
Resultados por mês completo) e a API da AirMenu falha com frequência.

**The flow from the business's point of view:**

```
Gerência                                   Sistema
──────────────────────────                 ─────────────────────────────────────
1. Abre Operação → Análise de Vendas   →   2. Mostra o mês corrente (Vendus) vs ano anterior;
                                              dias fechados em falta enchem-se sozinhos
3. Muda o período (máx. 12 meses)      →   4. Usa os dias guardados; hoje em direto
5. Escolhe «AirMenu» ou «Ambas»        →   6. Diz que meses têm dados; nada é pedido à AirMenu
7. Clica «Buscar <mês>»                →   8. Pede à AirMenu só os dias em falta desse mês e guarda-os
9. Vê a previsão do mês                →   10. IA (ou regra simples) prevê os dias que faltam
```

**Key concepts for the business:**

- **Bloco** — vendas de um dia, numa hora (Lisboa) e num canal: bruto com IVA
  (líquido de NC), líquido sem IVA e n.º de vendas.
- **Dia fechado** — qualquer dia antes de hoje. Guardado uma vez; nunca mais é pedido.
- **Canais** — Vendus: Salão, Take Away, Eatz, Apps (hoje = delivery próprio);
  AirMenu: Uber Eats, Glovo, Bolt Food.

## Technical purpose

Fornece os blocos de um período (e das janelas de comparação) a partir de uma
cache em Supabase, enche a cache da Vendus em segundo plano, busca a AirMenu
mês a mês a pedido e calcula a previsão do mês. **Não** calcula KPIs nem
destaques (frontend) e não altera Vendus, AirMenu nem Resultados.

## Domain concepts

- `SalesBucket` / `CompactBucket` (`[data, hora, canal, bruto, líquido, n.º]`; hora −1 = total do dia).
- `buckets.service` — documentos Vendus / encomendas AirMenu → blocos. FS/FT somam;
  cada NC subtrai o valor e uma venda no dia/hora em que é emitida.
- `dates` — aritmética de datas de calendário; `shiftMonth` cola ao último dia (31 → 30).
- `forecast.service` — histórico para a IA (só totais diários), prompt, validação
  da resposta (todos os dias, sem negativos, sem valores > 5× o máximo histórico)
  e regra de base (mediana do mesmo dia da semana nas últimas 6 semanas).

## Ports

### Input (use cases)

- `GetSalesAnalysisPort` — período (≤ 366 dias, até hoje) + fonte → blocos do
  período, ano anterior e mês anterior (diários), estado do preenchimento Vendus
  e estado de cada mês da AirMenu. Nunca chama a AirMenu.
- `FetchAirMenuMonthPort` — inicia, em segundo plano, a busca de um mês (só dias em falta + hoje).
- `GetSalesForecastPort` — previsão do mês corrente (cache por dia e fonte);
  `pending` se faltar histórico guardado.

### Output (domain dependencies)

- `VendusSalesSourcePort`, `AirMenuSalesSourcePort` — blocos de um intervalo.
- `SalesBucketStorePort` — `coveredDays`, `buckets`, `saveDays`.
- `ForecastModelPort` — texto → texto (JSON), `available`.
- `ClockPort` — hoje em Lisboa.

## Adapters

### Input

- `SalesAnalysisController` — `GET /api/sales-analysis?from&to&source`,
  `POST /api/sales-analysis/air-menu/fetch {month}` (202),
  `GET /api/sales-analysis/forecast?source`. Permissão `sales.analysis`
  (o POST só exige Ver: só lê dados externos para a cache).

### Output

- `VendusSalesSourceAdapter` — ponte para `vendus` (`GetSummaryPort`); hora lida do texto de `system_time`.
- `AirMenuSalesSourceAdapter` — ponte para `air-menu`; hora de `documentDate` em Europe/Lisbon (luxon);
  líquido = bruto × (líquido/bruto do período) — a AirMenu não dá IVA por encomenda.
- `SupabaseSalesBucketStoreAdapter` — `sales_analysis_buckets` + `sales_analysis_days` (D2, paginado a 1000).
- `createForecastModel` — OpenAI ou Gemini, com a mesma configuração do Assistente
  (`ASSISTANT_PROVIDER`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `OPENAI_API_KEY`/`ASSISTANT_MODEL`).
- `LisbonClockAdapter`.
- `VendusFillCoordinator` / `AirMenuFetchCoordinator` (application) — trabalhos em memória, um por organização/mês.

## Design decisions (ADR summary)

- **ADR-0045** — dias fechados guardados em blocos e nunca mais pedidos; Vendus enche-se
  sozinha; AirMenu só a pedido, um mês de cada vez, só os dias em falta.
- **ADR-0012** — só a loja principal (enterprise `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID`, Vendus da organização).
- **ADR-0011** — receita bruta com IVA, líquida de notas de crédito (como o Resultados).
- Permissão própria `sales.analysis`, fora dos defaults por módulo: Admin (MANAGE) e Manager/Gerência (READ).

## How to test

- Domain/use cases: `npx jest --config jest.config.cjs src/modules/sales-analysis` (fakes, sem rede nem BD).
- Suite completa: ver `reference` de comandos (`npm run check:ci` com env fictício).

## Known gaps / open debt

- Trabalhos de preenchimento vivem em memória: um deploy interrompe-os (o que já foi guardado fica; o resto recomeça no próximo acesso).
- A AirMenu pode omitir encomendas que falhem duas vezes sem erro; esses dias ficam guardados assim (ADR-0045).
- Uma NC emitida mais tarde com data de um dia já guardado não atualiza esse dia.
- Sem teste de integração do adapter Supabase (padrão do sales-summary).
- Horário de funcionamento fixo no frontend (seg–qui e dom 12h–22h30; sex–sáb 12h–23h30).
