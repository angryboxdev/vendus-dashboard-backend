# Module: stock-planning

> Status: active
> Last updated: 2026-09-30

---

## What it is and what it's for (business perspective)

Hoje o Stock é puramente reativo: mostra o que já aconteceu (saldo,
movimentos, "compras por rever", contagens físicas). Este módulo
("Planeamento de Stock" / Stock Intelligence 3.0) acrescenta uma camada de
**previsão e recomendação**: o que provavelmente vai faltar, quando, e o
que convém comprar — sem nunca alterar stock diretamente.

**The problem it solves:**
Sem isto, um gestor só descobre que um ingrediente vai faltar quando já
está a faltar (ou já faltou). Não há visibilidade sobre tendência de
consumo, nem uma lista de compras baseada em dados reais em vez de
intuição.

**The flow from the business's point of view:**

```
Cron diário (noite)                        Gestor (manhã seguinte)
──────────────────────                    ──────────────────────
1. Incrementa vendas de ontem
2. Prevê vendas dos próximos dias
3. Converte em consumo de ingrediente
4. Projeta stock, gera recomendações  →   5. Vê tela "Planeamento"
   e alertas                              6. Revê quantidade sugerida
                                           7. Gera lista de compras por
                                              fornecedor
                                           8. Compra fora do sistema —
                                              stock só muda quando a
                                              fatura for processada em
                                              "Compra por rever"
```

**Key concepts for the business:**

- **Fonte de procura** — o que é vendido (uma pizza+tamanho ou um item de
  stock vendido diretamente), não o item de stock em si.
- **Consumo previsto** — a fonte de procura convertida em quantidade de
  ingrediente, via receita/preparo.
- **Cobertura (dias)** — quantos dias o stock atual aguenta ao ritmo
  previsto.
- **Recomendação de reposição** — uma sugestão explicável, nunca uma
  encomenda.
- **Confiança** — Alta/Média/Baixa; nunca uma percentagem inventada.

---

## Technical purpose

Motor de previsão de vendas + conversão receita↔ingrediente + projeção de
stock (calculada em leitura) + recomendação de reposição + alertas de
risco, tudo **read/recommend-only**. Nunca escreve em `stock_movements` —
só os módulos `stock-purchase-review` e `stock-count` criam movimentos
reais. Não é um sistema de Purchase Order/receção/tracking de entrega.

## Domain concepts

- **`ForecastRun`** — uma execução do pipeline diário para uma loja;
  `running|completed|failed`; cada run novo marca-se `is_latest=true` e o
  anterior passa a `false` — histórico nunca apagado.
- **`PlanningAlert`** — `active|acknowledged|silenced|resolved`;
  identidade por fingerprint `(org, location, item, alertType)` — nunca
  duplicado, sempre atualizado/auto-resolvido.
- **`ForecastFeedback`** — create-only; uma linha por `(org, location,
  period_date)`; `submit()` só grava `reason_code`/`comment`.
- **`RecommendationReview`** — registo de auditoria da quantidade revista
  manualmente; nunca implica que a compra foi efetuada.
- **Fonte de procura** (`demandSourceType`/`demandSourceRef`) — reaproveita
  exatamente a identidade que `vendus_product_mapping`/
  `ConsumptionMappingEntry` já usa: `{type:"pizza", pizza_id, pizza_size}`
  (armazenado como `"<pizzaId>:<size>"`) ou `{type:"stock", stock_item_id}`
  (armazenado como o próprio id).

## Ports

### Input (use cases)

- `RunDailyForecastPort` — pipeline diário completo (9 passos), por
  organização e loja (ou todas as lojas ativas).
- `BackfillDemandActualsPort` — backfill único (admin), mesma leitura do
  incremento diário, dia a dia.
- `ListPlanningItemsPort` / `GetItemPlanningDetailPort` — tela principal +
  drawer de detalhe (projeção sempre recalculada em leitura).
- `ListPlanningAlertsPort` / `GetPlanningAlertDetailPort` /
  `AcknowledgeAlertPort` / `SilenceAlertPort`.
- `GeneratePurchaseListPort` — agrupa recomendações do último run por
  fornecedor.
- `ReviewRecommendationPort` — audita revisão manual da quantidade.
- `DetectForecastDeviationPort` / `SubmitForecastFeedbackPort`.
- `GetForecastHistoryPort` — tela "Histórico de previsões".

### Output (domain dependencies)

- `DemandActualsRepositoryPort`, `ForecastRunRepositoryPort`,
  `PlanningAlertRepositoryPort`, `ForecastFeedbackRepositoryPort`,
  `RecommendationReviewRepositoryPort` — tabelas próprias deste módulo.
- `RecipeConsumptionPort` — converte previsão de vendas em consumo de
  ingrediente (adapter legacy, ver Design decisions).
- `VendusSalesReadPort` — histórico diário de vendas por fonte de procura
  (adapter legacy, ver Design decisions).
- `StockQuantityReadPort` — wrapper sobre a RPC
  `get_stock_quantities_with_last_purchase` já existente.
- `StockItemPlanningReadPort` — leitura direta de `stock_items` (custo,
  min_stock, safety_stock, is_active).
- `SupplierDeliveryScheduleReadPort` — D10 → `financial-base` (porta
  formal, novo port `ListSupplierDeliverySchedulesPort`).
- `SupplierNameReadPort` — D10 → `financial-base` (`GetSupplierPort`).
- `LearnedMappingReadPort` / `PendingPurchaseReviewReadPort` /
  `StockCountSignalReadPort` — leitura direta de tabelas partilhadas com
  `stock-purchase-review`/`stock-count` (ver Design decisions — sem port
  formal exposto por esses módulos nesta ronda).
- `LocationReadPort` — D10 → `locations`.

## Adapters

### Input

- `StockPlanningController` → `/api/stock-planning/*`, `requireMinRole("manager")`
  no mount, admin-only inline para `backfill`/`run-forecast`/
  `detect-deviation` manuais.

### Output

- `Supabase*Repository` (5) → tabelas próprias (`sales_demand_actuals_daily`,
  `forecast_runs`+3 tabelas por-run, `planning_alerts`, `forecast_feedback`,
  `recommendation_reviews`).
- `LegacyRecipeConsumptionAdapter` → `computeConsumptionForProductLinesLenient`.
- `LegacyVendusSalesReadAdapter` → `buildMonthlySummary`/`fetchAllDocuments`.
- `StockQuantityReadAdapter` → RPC `get_stock_quantities_with_last_purchase`.
- `StockItemPlanningReadAdapter` → tabela legacy `stock_items`.
- `LearnedMappingReadAdapter` / `PendingPurchaseReviewReadAdapter` /
  `StockCountSignalReadAdapter` → tabelas de `stock-purchase-review`/
  `stock-count`, lidas diretamente.
- `SupplierDeliveryScheduleReadAdapter` / `FinancialBaseSupplierNameReadAdapter`
  → D10 sobre ports de `financial-base`.
- `LocationsReadAdapter` → D10 sobre `ListLocationsPort`.

## Design decisions (ADR summary)

### 1. Exceção legacy — reutilização, nunca reimplementação

A conversão "venda → ingrediente" (incluindo o fator `use_as_unit`/
`yield_qty` dos Preparos) já existe, testada, em
`src/services/stockAdjustmentFromLinesService.ts`
(`computeConsumptionForProductLinesLenient`). `LegacyRecipeConsumptionAdapter`
chama-a diretamente: para cada fonte de procura distinta, chama a função
**uma vez com qty=1** (obtendo o "fator de consumo por unidade vendida"),
e depois multiplica esse fator pela quantidade prevista de cada dia em
memória — evita chamar a função (que lê `pizza_recipes`/
`pizza_recipe_items`/`preparations` da BD) uma vez por dia do horizonte ×
fonte de procura, sem perder exatidão (a conversão é linear na
quantidade).

O histórico diário de vendas (`LegacyVendusSalesReadAdapter`) reutiliza
`buildMonthlySummary`/`fetchAllDocuments`
(`src/services/monthlySummaryService.ts`/`documentsService.ts`), o mesmo
modelo que `ingredientConsumptionService.ts` já usa.

Nenhum dos dois adapters importa domínio/rotas legacy — só estas duas
funções de conversão/leitura, exatamente como o CLAUDE.md permite (exceção
documentada, não um padrão a repetir sem justificação).

### 2. Projeção de stock nunca persistida (sem debounce/fila)

A projeção/cobertura/data de rutura são **sempre calculadas em leitura**:
`stock atual (RPC ao vivo) − consumo previsto acumulado (do último
forecast_run)`. Isto mantém a projeção sempre atualizada a cada leitura
sem precisar de nenhuma infraestrutura de fila/debounce (que não existe no
repositório) — só o *consumo previsto* em si (que muda pouco, só 1x/dia)
vem do último run. `forecast_stock_requirements` grava `expected_consumption`
e `cumulative_consumption`; a subtração ao stock ao vivo é feita em
`stock-projection.service.ts`, chamado pelos use cases de leitura, nunca
gravado.

### 3. Escrita do pipeline diário: vários passos simples, não uma RPC única

Ao contrário de `stock-count`/`stock-purchase-review` (que usam RPCs
`plpgsql` para lock otimista + transação multi-tabela porque **utilizadores
concorrentes** podem mutar a mesma sessão/revisão ao mesmo tempo), o
pipeline diário é um **job em lote de escritor único** (o cron), sem
concorrência de utilizadores editando a mesma linha. Por isso optei por
escrita em vários passos de adapter (flip de `is_latest`, upserts com
`ON CONFLICT` por fingerprint/chave única) em vez de uma única função
`plpgsql` — a alternativa (uma RPC aceitando arrays JSON variáveis para 5
tabelas, cobrindo um nº variável de itens/dias) seria mais arriscada de
acertar sem uma BD real para validar os joins/arrays, e o ganho de
atomicidade não se aplica aqui (não há dois writers a competir pela mesma
linha). Idempotência fica garantida na mesma: `is_latest` só um `true` por
loja, alertas por fingerprint, feedback por `(org,location,period_date)`.

### 4. Confiança — fórmula implementada

`confidence.service.ts`: pontuação começa em 4, penalizada por sinal
desfavorável — `historyDaysAvailable < 14` (-2) / `< 28` (-1);
`backtestWape` nulo (-1) / `> 0.5` (-2) / `> 0.25` (-1); mapeamento
incompleto (-2); "compra por rever" pendente (-1); stock negativo/instável
(-1); nunca contado fisicamente (-2) / contado há mais de 60 dias (-1).
Corte: `score >= 3` → Alta; `score == 2` → Média; resto → Baixa. Estes
limiares são uma escolha determinística documentada aqui — a task não
especifica a fórmula exata, só a invariante "nunca inflacionar confiança
quando falta informação", que esta fórmula respeita (histórico curto ou
mapeamento incompleto nunca produzem "Alta"). Cold start (secção 24) é
resolvido inteiramente por esta fórmula — não há uma tabela/flag de
"nível" separada.

### 5. Limiares de materialidade do desvio — configuráveis

`DEFAULT_DEVIATION_PERCENT_THRESHOLD = 0.2` (20%) e
`DEFAULT_DEVIATION_ABSOLUTE_THRESHOLD = 10` (unidades) são **defaults**,
não hardcoded num único ponto sem alternativa: `DetectForecastDeviationCommand`
aceita `percentThreshold`/`absoluteThreshold` por chamada. Um desvio só é
material quando **ambos** são ultrapassados (nunca só um) —
`deviation-detection.service.ts`, testado com casos de ruído (% grande,
absoluto irrelevante) e o inverso. Gap conhecido: ainda não existe uma
tabela de configuração por organização para persistir um valor customizado
— hoje só é configurável por chamada (cron/admin manual). Uma ronda futura
poderia adicionar isto a `stock_count_settings` ou a uma tabela de
definições própria.

### 6. Deteção de desvio: quantidade agregada, não receita ponderada

A task (secção "detect-forecast-deviation") descreve comparar a previsão
"agregada (receita)" do dia anterior vs. real. Implementado como
quantidade agregada (soma de `predicted_quantity` de todas as fontes de
procura ativas nesse dia vs. soma real de `sales_demand_actuals_daily`),
não receita ponderada — nem toda fonte de procura tem preço de venda
ligado de forma uniforme neste round, e introduzir isso agora arriscava
gerar números fabricados. O invariante central da task (desvio material →
exatamente 1 feedback, nunca duplicado por reprocessamento) fica
preservado de qualquer forma — testado explicitamente.

### 7. D10 "via tabela" em vez de porta formal (3 casos)

`LearnedMappingReadAdapter`, `PendingPurchaseReviewReadAdapter` e
`StockCountSignalReadAdapter` leem `stock_review_learned_mappings`/
`stock_purchase_reviews`+`stock_review_lines`/`stock_count_sessions`+
`stock_count_lines`+`stock_count_settings` diretamente via `ScopedQuery`,
em vez de através de um port exportado por
`stock-purchase-review.module.ts`/`stock-count.module.ts`. Motivo: nenhum
desses módulos expõe hoje essas leituras como porta pública, e alterá-los
além do que foi explicitamente aprovado para esta ronda (só a coluna
aditiva `slow_moving_days_threshold` em `stock-count`) estava fora do
âmbito. As tabelas já estão registadas em `table-registry.ts` e a leitura
é sempre org-scoped via `ScopedQuery` — nunca contorna RLS/isolamento. Uma
ronda futura que precise destas leituras a partir de um 3º consumidor
deveria promovê-las a ports formais nos módulos de origem.

Consequência prática: `stock-planning.module.ts` **não depende das
instâncias** de `stockPurchaseReviewModule`/`stockCountModule` em
`server.ts` — só de `financialBaseModule` (D10 via port) e `locationsModule`
(D10 via port) — por isso não entra no ciclo de construção já existente
entre `invoices`↔`stock-purchase-review`.

### 8. Comparação multi-fornecedor de preço — âmbito reduzido

A task pede comparação de preço normalizada por unidade base entre
fornecedores (secções 53-55). O schema atual não atribui
`stock_movements`/`stock_review_lines` a um fornecedor de forma direta
(sem `supplier_id` em `stock_movements`); um join via
`stock_review_lines.review_id → stock_purchase_reviews.decision_supplier_id`
foi avaliado como possível mas arriscado de validar sem acesso a uma BD
real nesta ronda. Implementado nesta ronda: `price-anomaly.service.ts`
compara a última compra (`stock_movements`, via
`StockQuantityReadPort`) com a referência de catálogo do item
(`stock_items.purchase_reference_unit_cost_without_vat`) — ambos dados
reais já existentes, nunca inventados — gerando o alerta `price_anomaly`.
`LearnedMappingReadPort.findAllForItem` continua a listar os fornecedores
conhecidos do item (packaging real), mas sem ranking de preço entre eles
nesta ronda. Documentado como gap explícito, não uma implementação
fabricada.

### 9. Backfill histórico de vendas Vendus — risco de performance confirmado

`fetchAllDocuments`/`buildMonthlySummary` não têm granularidade diária
nativa — agregam `since..until` num único total. Para obter um ponto por
dia, `LegacyVendusSalesReadAdapter`/`BackfillDemandActualsUseCase` chamam
`buildMonthlySummary({since: dia, until: dia, ...})` **uma vez por dia**,
sequencialmente; cada chamada faz 1 pedido de listagem + 1 pedido de
detalhe por documento FS/FT/NC real à API da Vendus (`mapLimit` com
`ENV.CONCURRENCY`, mas entre dias é sequencial, de propósito, para não
sobrecarregar a API/rate limits). Um backfill de ~90 dias é, portanto,
~90 chamadas sequenciais, cada uma proporcional ao volume de documentos
desse dia — em lojas com volume alto, isto pode demorar de minutos a
dezenas de minutos. **A granularidade diária É suportada** (não foi
preciso descer para granularidade mensal) — o risco é só de tempo de
execução, não de capacidade funcional. `BackfillDemandActualsUseCase`
isola falhas por dia (`daysFailed: string[]`) — um dia com problema na API
Vendus nunca perde o backfill inteiro. Recomendação operacional: correr o
backfill fora de um pedido HTTP síncrono normal (via job/cron interno,
não bloqueando a UI), especialmente para o intervalo completo de ~90 dias.
Isto **não foi validado contra dados Vendus reais** nesta sessão (sem
acesso a um ambiente real) — o plano original já assinalava isto como
verificação manual pendente.

### 10. Outras simplificações documentadas

- **Multi-loja Vendus**: a leitura diária não faz mapeamento explícito
  loja→`vendus_store_id` (não há uma tabela clara desse mapeamento ligada
  a este fluxo); para organizações com uma única loja ativa (caso mais
  comum hoje) isto é irrelevante. Gap conhecido para organizações
  multi-loja com um único registo Vendus partilhado.
- **`actualQuantity` no detalhe do item**: a tabela "consumo previsto" no
  drawer devolve só a série prevista (`forecast_stock_requirements`); a
  série "real" (consumo real convertido a partir de vendas reais, não só
  previsões) não é recalculada nesta ronda — exigiria repetir a conversão
  sobre o histórico de vendas real, não só sobre previsões. Documentado,
  campo sempre `null`, nunca um número fabricado.
- **`hasIncompleteMapping` em leituras (list/detail)** não é recalculado
  com precisão sem repetir a conversão completa: itens com uma
  recomendação já herdam a confiança calculada no momento do run (que já
  inclui este sinal); itens sem recomendação usam uma confiança
  recalculada mais simples (sem este sinal específico).
- **Auto-consumo Vendus** fica fora da cache de procura diária nesta
  ronda (só documentos `FS`/`FT`/`NC` reais) — gap conhecido, não
  fabricado.
- **`planning_alerts.item_id`** é `NOT NULL` porque todos os 4 tipos de
  alerta desta ronda são por item. Um tipo de alerta futuro não ligado a
  um item precisaria de rever esta constraint (e a unicidade do
  fingerprint, que hoje depende de `item_id` nunca ser nulo).

## How to test

- Domínio/serviços: `npx jest src/modules/stock-planning/__tests__/domain`
  (puros, sem I/O).
- Use cases: `npx jest src/modules/stock-planning/__tests__/use-cases`
  (fakes para todas as portas de saída).
- Módulo completo + módulos afetados:
  `npx jest src/modules/stock-planning src/modules/financial-base src/modules/stock-count`.
- `npx tsc --noEmit` (repo inteiro) e `npx depcruise src --config .dependency-cruiser.cjs`.

## Known gaps / open debt

- Comparação de preço multi-fornecedor totalmente normalizada (secções
  53-55) — só "última compra vs. referência de catálogo" implementado;
  ranking entre fornecedores fica para uma ronda futura (ver Design
  decisions #8).
- Limiares de desvio (`percentThreshold`/`absoluteThreshold`) ainda não
  persistidos por organização — só configuráveis por chamada.
- `LearnedMappingReadPort`/`PendingPurchaseReviewReadPort`/
  `StockCountSignalReadPort` deveriam ser promovidos a ports formais nos
  módulos de origem (`stock-purchase-review`/`stock-count`) se um 3º
  consumidor precisar das mesmas leituras.
- Backfill de ~90 dias não foi testado contra um ambiente Vendus real
  (ver Design decisions #9) — validar tempo de execução antes de confiar
  no gráfico "Vendas previstas vs. reais" em produção.
- Segundo modelo de forecast (seleção por desempenho de backtest, secção
  23) não implementado — arquitetura (`ForecastModel`) já preparada para
  isso.
- Frontend (6 mockups, `recharts`, abas do fornecedor) não faz parte
  desta entrega — âmbito desta tarefa foi só o backend.
