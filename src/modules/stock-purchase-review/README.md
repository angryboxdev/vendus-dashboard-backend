# Module: stock-purchase-review

> Status: active
> Last updated: 2026-09-30 (`DeleteDraftStockPurchaseReviewUseCase` +
> `GetStockPurchaseReviewStatusForInvoiceUseCase` — nova exceção estreita ao
> "nunca hard delete", chamada por `invoices` para resolver o crash de FK ao
> editar "Impacto no stock"/descartar linhas com uma revisão associada)

---

## O que é e para que serve (perspectiva de negócio)

Nem toda fatura de mercadoria muda o stock automaticamente — hoje, mesmo uma
fatura da Makro paga pela conta da empresa não gera nenhum inventário nem
pendência: o stock só muda por ajuste manual ou pelo consumo calculado a
partir das vendas. Este módulo cria a ponte que faltava: quando uma fatura é
lançada, o sistema decide (de forma auditável, nunca sozinho) se ela deve
gerar uma "Compra por rever"; um gestor de Stock resolve fisicamente cada
linha; só ao confirmar é que nascem movimentos reais de stock.

**O problema que resolve:**
Sem isto, o inventário fica sempre desatualizado em relação às compras reais
— alguém tinha de lembrar-se de ajustar manualmente cada fatura de
mercadoria, sem rasto de que fatura originou que entrada.

**O fluxo do ponto de vista do negócio:**

```
Financeiro                              Stock
────────────────────────────────────   ──────────────────────────────────
1. Lança a fatura (Makro, mercadoria)
2. Sistema decide: categoria/
   fornecedor dizem "gera revisão"
   → cria "Compra por rever"       →   3. Gestor abre "Compras por rever"
                                        4. Mapeia cada linha: item existente
                                           / item novo / não afeta stock
                                        5. Confirma → nascem movimentos reais
```

**Conceitos-chave para o negócio:**

- **Compra por rever** — a ponte entre uma fatura e o stock físico. Nunca
  uma segunda fatura; só uma referência de trabalho.
- **Decisão de impacto** — nunca automática-para-stock: só decide se deve
  existir uma revisão para um humano decidir, nunca move quantidade sozinha.
- **Origem dos fundos vs. Centro de Custo** — Centro de Custo nunca decide
  isto; só a categoria/subcategoria financeira e a preferência do
  fornecedor (Centro de Custo fica reservado para uma futura inferência de
  localização física).

---

## Propósito técnico

Fundação da integração Financeiro→Stock (Fase 1): motor de decisão
(categoria/fornecedor/override, nunca Centro de Custo), CRUD da Compra por
rever com mapeamento linha a linha (item existente/novo/não afeta stock),
confirmação atómica que gera movimentos reais em `stock_movements`
(tabela legacy, reutilizada tal qual), idempotência em 3 níveis e lock
otimista. **Não é responsabilidade deste módulo nesta fase**: multi-armazém
completo, devoluções físicas por nota de crédito, rateio de custos, fecho
formal de período, criação manual de linhas quando a fatura não tem linhas
estruturadas (ver Known gaps).

## Domain concepts

- **`StockPurchaseReview`** — aggregate root. Estados
  `pending|in_review|partial|ready|applied|cancelled`; `invoiceId` é
  UNIQUE (garantido pela BD, não só aqui) — uma fatura nunca tem duas
  revisões ativas, mesmo cancelada não recria automaticamente.
  `version` — lock otimista, incrementado em toda mutação.
  `sourceHash`/`sourceInvoiceVersion` — snapshot para detetar a fatura
  alterada depois da revisão criada (nunca aplica sobre divergência não
  validada). `decisionSource`/`decisionPolicyUsed`/`decisionActor` — a
  decisão nunca é recalculada retroativamente quando a configuração de
  categoria/fornecedor muda depois. `apply()` só a partir de `ready`,
  terminal; `cancel(reason)` exige sempre motivo, nunca hard delete.
- **`StockReviewLine`** — id próprio estável (nunca a descrição).
  `resolve(...)` é o único método de mutação: `existing_item`/`new_item`
  calculam `stockQuantity = purchaseQuantity × conversionFactor` e
  exigem `conversionFactor > 0` finito; `no_stock_effect` limpa todos os
  campos de stock. `UnitConversionService` sinaliza (nunca bloqueia) pares
  dimensionalmente suspeitos (ex: kg→L).
- **`stock-review-decision.service.ts`** — `decideStockReview(...)`, função
  pura sem I/O, implementa a precedência Caso 1-5: override explícito →
  categoria (`CREATE_REVIEW` nunca cancelado pela preferência do
  fornecedor) → preferência do fornecedor (só quando a categoria é
  `UNDEFINED`) → `unresolved` quando nada decide. Um `force_skip` sem
  motivo, quando a categoria/fornecedor normalmente geraria revisão, nunca
  é honrado silenciosamente — degrada para `unresolved` em vez de bloquear
  a fatura ou desativar stock por acidente (ver Design decisions).

## Ports

### Input (use cases)

- `RecordInvoiceFinalizedForStockPort` — o gancho chamado (fire-and-forget)
  por `invoices` quando uma fatura é finalizada. Idempotente por
  construção — nunca cria duas revisões para a mesma fatura.
- `ReprocessMissingStockReviewsPort` — varredura de recuperação (cron),
  rede de segurança em vez de outbox formal (ver Design decisions).
- `ListStockPurchaseReviewsPort`/`GetStockPurchaseReviewPort` — leitura.
- `ResolveReviewLinePort` — mapeia uma linha; aprende o mapeamento
  (fornecedor + referência/descrição) quando resolve para item existente
  ou "não afeta stock", nunca cria item novo sozinho a partir de uma
  sugestão aprendida.
- `DecideUnresolvedReviewPort` — a única forma de sair de
  `decisionSource: unresolved`.
- `GetStockPurchaseReviewStatusPort` — leitura fina (`reviewId`+`status`)
  para `invoices` (D10) — usada pelo guard de edição de fatura contra
  revisão de stock bloqueante/pendente (ver Design decisions).
- `DeleteDraftStockPurchaseReviewPort` — chamado por `invoices` (D10)
  quando o utilizador confirma explicitamente que quer descartar uma
  revisão ainda não aplicada; hard-delete real, ver Design decisions.
- `SuggestLineMappingPort` — sugestão de mapeamento aprendido, nunca
  auto-aplicada.
- `ConfirmStockPurchaseReviewPort` — revalida a fatura de origem (hash),
  resolve a loja quando em falta, delega a aplicação atómica à RPC.
- `CancelStockPurchaseReviewPort` — nunca hard delete, exige motivo.
- `CancelEmptyStockPurchaseReviewsPort` — remediação em lote: cancela
  (com motivo fixo, auditado) todas as revisões não-terminais sem
  nenhuma linha. `POST /stock-purchase-reviews/cancel-empty`. Ver "Bug
  corrigido (30/09/2026)".

### Output (domain dependencies)

- `StockPurchaseReviewRepositoryPort` — persistência de
  `StockPurchaseReview`/`StockReviewLine`; `save()` com lock otimista
  (`expectedVersion`). `hardDelete(organizationId, reviewId)` — única
  exceção deliberada à regra "nunca hard delete" do módulo, ver Design
  decisions; apaga `stock_review_lines` antes de `stock_purchase_reviews`
  (ordem FK). O chamador (`DeleteDraftStockPurchaseReviewUseCase`) garante
  que a revisão nunca está `applied` antes de chamar.
- `StockReviewLearnedMappingPort` — mapeamento aprendido, procura por
  referência primeiro, descrição normalizada como fallback.
- `StockReviewAuditLogPort` — mirror exato de `AccountingAuditLogPort`.
- `StockCatalogWritePort` — escreve `stock_items` (tabela legacy)
  diretamente, nunca via `src/services/stockItemService.ts` (CLAUDE.md:
  nunca imitar/estender um módulo legacy).
- `StockMovementWritePort` — as duas RPCs `plpgsql` (criação idempotente +
  confirmação atómica).
- `InvoiceReadPort`/`CostCenterCategoryReadPort`/`SupplierReadPort`/
  `LocationReadPort` — D10, wrappers finos sobre os input ports já
  expostos por `invoices`/`financial-base`/`locations`.

## Adapters

### Input

- `StockPurchaseReviewController` → `/api/stock-purchase-reviews/*`,
  `requireMinRole("manager")` aplicado no mount (`server.ts`).

### Output

- `SupabaseStockPurchaseReviewRepository` → `stock_purchase_reviews`/
  `stock_review_lines`.
- `SupabaseStockReviewLearnedMappingRepository` → `stock_review_learned_mappings`.
- `SupabaseStockReviewAuditLogAdapter` → `stock_review_audit_logs`,
  fire-and-forget.
- `SupabaseStockCatalogWriteAdapter` → escreve `stock_items` diretamente.
- `SupabaseStockMovementWriteAdapter` → chama
  `fn_stock_review_create_from_invoice`/`fn_stock_review_confirm`
  (`ScopedQuery`, `20260930100100_stock_purchase_review_rpcs.sql`).
- `InvoicesGetInvoiceReadAdapter`/`FinancialBaseCostCenterCategoryReadAdapter`/
  `FinancialBaseSupplierReadAdapter`/`LocationsReadAdapter` — traduções D10.

## Design decisions (ADR summary)

### Ciclo de construção `invoices` ↔ `stock-purchase-review` resolvido com um indirection object

`invoices` precisa do `recordInvoiceFinalizedForStock` deste módulo no
momento da própria construção (injetado no `CreateInvoiceUseCase`/
`ConfirmImportedInvoiceUseCase`); este módulo, por sua vez, lê `invoices`
(D10) para revalidação e para a varredura de recuperação. Nenhum dos dois
pode ser construído primeiro na forma direta. `server.ts` resolve isto com
uma referência mutável (`{ current: RecordInvoiceFinalizedForStockPort }`)
passada a `invoices` antes de o use case real existir, atribuída ao use
case real logo a seguir — nunca dentro de nenhum módulo, só no composition
root.

### Sem outbox formal — mecanismo leve, confirmado com o utilizador

A task original sugere um "Transactional Outbox" para o Financeiro nunca
depender da disponibilidade do Stock. Este codebase não tem fila de
mensagens nem barramento de eventos (confirmado por grep — o `EventEmitter`
de `air-menu` é puramente em memória, não sobrevive a um restart). A
solução: (1) tentativa síncrona fire-and-forget logo após gravar a fatura
— nunca bloqueia; (2) idempotência por construção
(`invoice_id UNIQUE` + `ON CONFLICT DO NOTHING`) — retry nunca duplica;
(3) `ReprocessMissingStockReviewsUseCase`, exposta no cron interno
(`CRON_SECRET`) como rede de recuperação — correr redundantemente é sempre
seguro.

### `force_skip` sem motivo nunca é honrado silenciosamente

Quando a categoria/fornecedor normalmente geraria revisão, um override
`force_skip` sem motivo degrada para `unresolved` em vez de (a) bloquear a
fatura à espera do motivo, ou (b) confiar cegamente no skip. Isto evita
desativar o rastreio de stock por acidente sem introduzir uma dependência
síncrona de `invoices` sobre este módulo — a fatura finaliza sempre, e o
caso ambíguo aparece em "Compras por rever" para um humano decidir.

### As 2 únicas RPCs `plpgsql` do módulo

PostgREST não dá transação multi-tabela ad-hoc. `fn_stock_review_confirm`
faz `SELECT ... FOR UPDATE` (lock otimista) + curto-circuito quando já
`applied` (idempotência do endpoint) + validação de item ativo + inserção
de movimentos com `ON CONFLICT (purchase_review_id, review_line_id) DO
NOTHING` (idempotência do movimento) — tudo numa transação. `p_location_id`
é só fallback para linhas sem loja própria, nunca decidido pelo Centro de
Custo.

### `StockCatalogWritePort` escreve `stock_items` diretamente, nunca via serviço legacy

`src/services/stockItemService.ts` é legacy (CLAUDE.md). Este módulo tem o
seu próprio adapter Supabase para a mesma tabela — nunca importa nem
estende o serviço legacy, só partilha o schema.

### Aprendizagem de mapeamento nunca cria item novo sozinha

`SuggestLineMappingPort` devolve só uma sugestão; `resolve-review-line`
exige sempre uma ação humana explícita mesmo quando a sugestão existe.

### Bug corrigido (30/09/2026) — fatura sem linhas nunca pode criar revisão

`refreshLinesProgress` só recalcula o estado para `"ready"` a partir da
resolução de uma linha (`ResolveReviewLineUseCase`); uma revisão sem
nenhuma `stock_review_line` **nunca** tem esse gatilho, ficando presa para
sempre em `pending`/`in_review` — o botão "Confirmar e adicionar ao stock"
fica indisponível para sempre, sem indicar porquê. Isto acontecia sempre
que `RecordInvoiceFinalizedForStockUseCase` recebia `command.lines: []`
— faturas em `lineDetailMode=simple` (sem `invoice_lines` persistidas,
incluindo o novo default "classificação única" do módulo `invoices`) e
notas de crédito sem linhas. Encontrámos 28 revisões presas em produção
nesta condição ao diagnosticar o sintoma. Corrigido fazendo
`RecordInvoiceFinalizedForStockUseCase` nunca criar revisão quando
`command.lines.length === 0` — mesmo com override `force_create` ou
política de categoria/fornecedor a indicar criação — não há
quantidade/item nenhum para resolver sem linhas. As 28 revisões já presas
não são corrigidas retroativamente por este fix (não há como recalcular
`refreshLinesProgress` sem linhas); para as regularizar existe
`CancelEmptyStockPurchaseReviewsUseCase` (`POST
/stock-purchase-reviews/cancel-empty`, botão na lista de revisões no
frontend), que faz exatamente o mesmo que "Cancelar revisão" uma a uma —
`cancel(reason)` com motivo fixo, auditado, nunca hard delete — e nunca
toca em revisões `applied`/`cancelled` nem em revisões com linhas.

### Exceção deliberada e estreita a "nunca hard delete": rascunho nunca aplicado, descartado por `invoices`

O módulo inteiro é desenhado à volta de "nunca hard delete" —
`cancel(reason)` é a única forma de "remover" uma revisão, sempre com
motivo, sempre auditada, sempre recuperável. `DeleteDraftStockPurchaseReviewUseCase`
é a ÚNICA exceção, e só entra em jogo num cenário muito específico: o
utilizador de `invoices` muda o "Impacto no stock" de uma fatura, ou
descarta as linhas detalhadas (`detailed → simple`), e a revisão associada
(criada automaticamente pelo gancho de finalização) ainda não foi
**aplicada** — ou seja, nenhum `stock_movement` real chegou a existir a
partir dela. Não há nada de real ou auditado a preservar: um `cancel()`
deixaria um registo morto na tabela só para satisfazer a mesma regra que
`cancel()` protege — dados que já viraram compromissos reais. Guard-rails
que mantêm a exceção estreita:

- **Nunca aplicável a revisões `applied`** — `DeleteDraftStockPurchaseReviewUseCase`
  verifica `review.status === "applied"` e lança `ReviewAlreadyAppliedError`
  antes de tocar em qualquer linha; o chamador (`invoices`, via o guard
  partilhado `shared-stock-review-guard.ts`) nunca sequer tenta chamar isto
  quando a revisão já gerou movimentos — bloqueia a edição em vez disso,
  sempre, sem opção de confirmação.
- **Nunca silencioso** — só é chamado depois de `invoices` ter pedido
  confirmação explícita ao utilizador (`confirmRemoveStockReview: true` no
  pedido HTTP); sem essa fatura ainda ter revisão nenhuma associada, é um
  no-op idempotente (`{deleted: false}`), nunca um erro.
- **Sempre auditado antes de apagar** — grava uma entrada
  `draft_deleted_due_to_invoice_edit` em `StockReviewAuditLogPort` (com o
  `before` completo da revisão) antes de chamar `hardDelete` — o rasto de
  "isto existiu e foi removido por causa de X" sobrevive mesmo à remoção
  física da linha.
- **Só alcançável por este único caminho** — não há endpoint HTTP deste
  módulo que exponha `hardDelete`; só `invoices` (D10, via
  `DeleteDraftStockPurchaseReviewPort`) pode desencadear isto, nunca um
  humano diretamente em "Compras por rever".

### F3a (task v1.2) — linhas reais e três conferências

- **Linhas reais com valores do documento**: a fatura passa ao Stock, por linha, o IVA (líquido com descontos = total − IVA), a referência do fornecedor, a categoria financeira (snapshot) e a loja; e os totais da fatura (base/IVA/total). Colunas novas em `stock_review_lines`/`stock_purchase_reviews` (migração `20261110100000_stock_review_f3a`). Revisões anteriores ficam com estes campos a null e as conferências «indisponíveis» (nunca bloqueiam).
- **Custo unitário a partir do líquido** (`StockReviewLine.resolveToStockItem`): sem IVA = líquido ÷ (qtd × fator); com IVA = total ÷ (qtd × fator). Descontos de linha e globais já vêm repartidos no líquido; o custo das linhas «Não é item de stock» (ex.: equipamento) nunca é espalhado pelas outras. Sem IVA guardado → cálculo original.
- **Três conferências** (`domain/services/review-conference.service.ts`, calculadas em GET/resolver/confirmar): (1) **Documento** — todas as linhas, incluindo as não inventariáveis, somam a base e o IVA da fatura; diferença → `DocumentNotReconciledError` (422 `document_not_reconciled`) e nada é movimentado. (2) **Stock** — só as inventariáveis geram quantidade/custo (não precisam de somar o total). (3) **Categorias** — política de Stock da categoria financeira contra o tratamento da linha (artigo numa categoria `NO_STOCK_EFFECT`, ou «Não é item de stock» numa `CREATE_REVIEW`); é **pendência para o Financeiro**: não bloqueia, não corrige nada, fica gravada em `category_divergences` ao confirmar.
- **Divisão por lojas**: `locationSplits` (≥ 2 lojas ativas, distintas, quantidades explícitas cuja soma = quantidade da linha); a RPC cria um movimento por loja (índice único passa a revisão + linha + loja) e volta a validar a soma (`split_mismatch`). Nunca a quantidade integral em cada loja.
- **«Excluída — não afeta Stock»** (`excluded`): confirmar com todas as linhas «Não é item de stock» termina sem movimento (estado terminal, auditoria `confirm_excluded`). Para o guard de edição de `invoices` conta como não aplicada (não há movimentos).
- **Embalagem alterada**: a sugestão aprendida traz `packagingChanged` quando a unidade da linha difere da aprendida — o frontend não reaproveita o fator antigo.
- Fora da F3a (ficam para F3b/F3c): estados da fila, reprocessamento/linhas manuais, «Retirar de Compras por rever», importação no Stock; NC (devolução física vs. correção de preço) continua só no Financeiro.

### F3b (task v1.2) — conciliação inteligente e fila

- **Conciliação proposta por linha** (`SuggestReviewMappingsUseCase`, `POST /stock-purchase-reviews/:id/suggestions`, `{ refresh? }`): para as linhas por resolver, por esta ordem — (1) **histórico do fornecedor** (`StockReviewLearnedMappingPort`, agora pela referência do fornecedor e depois pela descrição; aprender também grava a referência); (2) **nome claramente igual no catálogo** (`domain/services/item-matching.service.ts`: tokens sem acentos/embalagem/stopwords, pontuação ≥ 0,75 e 0,15 acima do segundo); (3) **IA** (`StockItemMatchAiPort` → `OpenAiStockItemMatchAdapter`, uma chamada por revisão só com o que sobra; enum = ids reais dos candidatos dessa linha, pode responder «não é item de stock»; abaixo de 60% de confiança é ignorada; falhar não bloqueia). Sem `OPENAI_API_KEY` ou com `STOCK_MATCH_AI=off` fica só histórico + nome. A IA só recebe descrições e nomes de artigos (sem fornecedor, NIF nem valores).
- **Fator pela embalagem** (`suggestConversionFactor`): «25kg» em saco → 25 kg; «1,5L x6» → 9 L ou 6 un; «24x33cl» → 7920 ml; kg → g = 1000; nunca massa ↔ volume. Embalagem diferente da aprendida → `packagingChanged` e fator recalculado pela nova embalagem.
- **Gravada na linha** (`suggestion_*`, migração `20261111150000_stock_review_suggestions`): reabrir não volta a pagar IA; `source: "none"` = procurado sem resultado. **Nunca resolve sozinha** — aceitar é um `resolve` normal, feito pela pessoa (um a um ou «Aceitar as N propostas»). O adapter só escreve as colunas da sugestão quando a linha a tem.
- **Fila**: `GET /stock-purchase-reviews?view=active|history` (por tratar vs. movimentadas/excluídas/retiradas); linhas com progresso (`resolvedLines`), valor (`totalCents`), destino e origem. Estados na UI: Por mapear → Em revisão → Pronto → Movimentado; Excluída; Retirada.
- **Retirar / Repor**: «Retirar de Compras por rever» é o `cancel(reason)` existente (motivo + auditoria, não toca na fatura, conta a pagar, pagamentos nem conciliação). `POST /stock-purchase-reviews/:id/restore` (`RestoreStockPurchaseReviewUseCase`) repõe só retiradas, com o estado recalculado pelas linhas — uma retirada nunca teve movimentos, por isso não há nada a repetir. Movimentada continua a não se poder retirar (exige ajuste/estorno).
- O botão «Cancelar revisões sem linhas» saiu da UI (o endpoint fica, sem uso).
- Fora (F3c): estados «A extrair»/«Falha de extração», reprocessamento e linhas manuais — só fazem sentido com a importação direta no Stock.

## Como testar

- `npx jest src/modules/stock-purchase-review` (fakes para todas as portas
  de saída, incluindo D10 — vivem em `__tests__/fakes/`).
- `decideStockReview` (`stock-review-decision.service.test.ts`) cobre a
  precedência completa dos Casos 1-5, incluindo o `force_skip` sem motivo
  degradando para `unresolved`.
- `ConfirmStockPurchaseReviewUseCase` cobre revalidação de hash, resolução
  de loja (única vs. múltiplas ativas) e idempotência (duplo clique via
  `alreadyApplied`).
- Testes de integração (Supabase real) para as 2 RPCs ficam pendentes
  desta ronda — ver Known gaps.
- F3a (`__tests__/use-cases/f3a-conference.test.ts`): exemplo Makro 650 € (documento reconcilia, Stock 400 €, equipamento fica financeiro), base diferente bloqueia, revisões antigas «indisponíveis», divergências de categoria sem bloquear, Mozzarella (custo pelo líquido com desconto), divisão por lojas válida/inválida, todas não inventariáveis → `excluded`, gancho de faturas com IVA/categoria/loja/totais.
- F3b (`__tests__/use-cases/f3b-matching.test.ts`): nomes e embalagens (domínio), ordem histórico → nome → IA numa só chamada, sem resolver nada, reabrir sem nova IA e `refresh`, IA fora dos candidatos ignorada, falha da IA, embalagem alterada, fila ativa/histórico, repor.
- `DeleteDraftStockPurchaseReviewUseCase`/`GetStockPurchaseReviewStatusForInvoiceUseCase`
  (`delete-draft-stock-purchase-review.test.ts`) cobrem: no-op sem revisão,
  hard-delete com auditoria quando ainda não aplicada, e
  `ReviewAlreadyAppliedError` (nunca apaga) quando já aplicada.

## Known gaps / open debt

- **Criação manual de linhas quando a fatura não tem linhas estruturadas**
  (secção 19 da task) — uma fatura em modo "resumo" (só CMV total) ainda
  não permite ao gestor adicionar linhas físicas manualmente dentro da
  revisão nesta ronda; a revisão é criada com as linhas que existirem
  (mesmo zero).
- **Testes de integração das 2 RPCs** (Supabase real) — os testes desta
  ronda cobrem os use cases com fakes; a validação da transação `plpgsql`
  em si (concorrência real, `FOR UPDATE`) fica para uma próxima ronda.
- **Fase 2 (mockups completos)** — o frontend desta ronda é mínimo (lista
  simples + formulário simples), sem os 6 ecrãs do mockup original.
- **Sem multi-armazém completo** — além da divisão explícita por lojas
  (F3a), a resolução de loja no confirm cobre só 0/1/N lojas ativas; não há
  hierarquia nem regras avançadas de localização.
- **Reversão física de Nota de Crédito** — nunca implementada nesta task,
  por desenho (a Nota de Crédito só afeta o Financeiro).
