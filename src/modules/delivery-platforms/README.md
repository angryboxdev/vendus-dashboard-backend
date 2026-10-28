# Módulo: delivery-platforms

> Status: active
> Last updated: 2026-10-28

---

## O que é e para que serve (perspetiva do negócio)

O restaurante vende pela Uber Eats, Glovo e Bolt Food. Cada plataforma retém comissões, promoções e anúncios e transfere o resto. Este módulo lê os extratos que as plataformas emitem e guarda, por documento, o que se vendeu e o que se pagou à plataforma.

**O problema que resolve:**
Sem os extratos, só se vê o que chega ao banco — não se sabe quanto se vendeu, quanto custaram as promoções e o marketing, nem a margem real de cada plataforma.

**O fluxo do ponto de vista do negócio:**

```
Gestor                                   Sistema
──────────────────────                  ──────────────────────
1. Descarrega os extratos (PDF)
   da Uber e da Glovo
2. Envia-os todos de uma vez        →   3. Reconhece a plataforma, lê os totais
                                            e confere que batem com o transferido
                                        4. Mostra os importados e os rejeitados
5. Vê os extratos do mês            →   6. Totais por natureza, por plataforma
```

**Conceitos-chave para o negócio:**

- **Extrato** — documento da plataforma para um período (Uber: mês civil; Glovo: quinzena), com número próprio.
- **Vendas** — o que o cliente pagou pelos artigos (com IVA), mais gorjetas e taxas cobradas ao cliente.
- **Promoções** — descontos suportados pelo restaurante (incluindo «compre um, leve outro»), pelo valor que a plataforma indica.
- **Comissão / Marketing / Outras taxas** — o que a plataforma cobra, com IVA.
- **Líquido transferido** — o que a plataforma paga ao restaurante.

---

## Propósito técnico

Converte o texto de um documento (PDF, CSV ou XML) numa `PlatformStatement` (linhas por natureza com valor bruto e IVA, transferências e líquido) e guarda-a por organização. Não lança faturas, não concilia com o banco (F4) nem calcula a margem (F3, a partir destes dados).

## Conceitos de domínio

- `PlatformStatement` — plataforma, tipo de documento, número, período, data de emissão, nº de pedidos, `lines`, `payouts`, `netPayoutCents`.
- `StatementLine` — `kind` (`sales|promotion|commission|marketing|other_fee|refund|cash|adjustment`), `grossCents` (reduções positivas) e `vatCents`.
- Documentos lidos: extrato mensal da Uber (PDF), extrato quinzenal da Glovo (PDF), relatório de pedidos da Bolt (CSV), fatura semanal da Bolt (PDF) e SAF-T de vendas do AirMenu (XML, origem `airmenu`: as três plataformas juntas, só para conferir).
- `netPayoutCents` é o que o documento soma à transferência: na Bolt, o relatório de pedidos soma as vendas e cada fatura semanal subtrai o seu total, e a soma dá o líquido; no SAF-T é o faturado menos as notas de crédito.
- `StatementLine.date` quando o documento separa por dia (pedidos da Bolt, SAF-T) — base para repartir as semanas da Bolt pelos meses no relatório (F3).
- Invariante: vendas − restantes linhas = líquido do documento, com tolerância de 2 cêntimos (`computedPayoutCents`); se não bater, o documento é rejeitado.
- Um extrato é único por (organização, plataforma, número): reimportar substitui.

## Portas

### Entrada (casos de uso)

- `ImportPlatformDocumentsPort` — importa vários ficheiros; cada um é tratado à parte (importado ou rejeitado com motivo).
- `ListPlatformStatementsPort` — extratos cujo período toca um mês, com totais por natureza (`summarizeStatement`).
- `GetPlatformMarginReportPort` — margem por plataforma do mês (`buildMarginReport`); exposto também a outros módulos (DRE, F3b).
- `ExportPlatformMarginReportPort` — o mesmo relatório em Excel ou PDF.
- `GetPayoutReconciliationPort` — conferência das transferências que pagam as vendas do mês × créditos no banco (F4).
- `GetFoodCostPort` / `SaveProductMappingsPort` — custo real da comida e da embalagem do delivery no mês e correção dos mapeamentos dos produtos (F5).

### Saída (dependências do domínio)

- `DocumentTextPort` — texto de um ficheiro (null se não houver texto).
- `PlatformStatementRepositoryPort` — `save` (upsert, diz se substituiu) e `listOverlapping`.
- `MarginReportWriterPort` — escreve o relatório em `xlsx` e `pdf`.
- `PlatformBankCreditsReadPort` — créditos das plataformas no banco e último dia importado.
- `ProductCostsReadPort` — custo das fichas técnicas por tamanho e dos artigos de stock.
- `ProductMappingRepositoryPort` — mapeamentos gravados dos produtos e dos artigos da embalagem.

## Adapters

### Entrada

- `DeliveryPlatformsController` → `GET /api/delivery-platforms/food-cost?year&month`, `PUT /api/delivery-platforms/product-mappings`, `GET /api/delivery-platforms/payouts?year&month`, `GET /api/delivery-platforms/report?year&month` e `GET /api/delivery-platforms/report/export?year&month&format=xlsx|pdf`; `POST /api/delivery-platforms/import` (multipart, `files`, até 20, 15 MB cada) e `GET /api/delivery-platforms/statements?year&month`; permissão `dre.statement`.

### Saída

- `DocumentTextAdapter` → `pdf-parse` para PDF; UTF-8 para `.csv`/`.txt`; `.xml` na codificação declarada (Windows-1252 no AirMenu).
- `SupabasePlatformBankCreditsAdapter` → `bank_movements` (só leitura, tabela do `bank-statements`); a plataforma de cada crédito vem do `DescribeMovementPort` do `bank-statements` (dependência do composition root, ligada em `server.ts`).
- `RecipeCostingProductCostsAdapter` → `GetRecipeCostingPort` e `GetStockItemCostsPort` do `recipe-costing` (ligados em `server.ts`).
- `SupabaseProductMappingRepository` → `delivery_product_mappings`.
- `MarginReportWriterAdapter` → Excel (`xlsx`: folhas «Margem» e «Documentos») e PDF (`pdfkit`).
- `SupabasePlatformStatementRepository` → tabela `delivery_platform_statements` via `createScopedQuery`.

## Decisões de design

- **Só o essencial:** guardam-se totais por natureza e transferências; nunca as linhas por pedido, nomes ou notas de clientes (RGPD).
- **Promoções como custo** pelo valor da plataforma, sem estimar o custo real do artigo oferecido (decisão do utilizador, 2026-10-28).
- **Taxas com IVA:** Uber — o extrato traz as taxas com IVA (23%), o IVA é calculado; Glovo — o IVA do documento é repartido pelas taxas em proporção, arredondamento na última.
- **Bolt:** o relatório de pedidos só lê data, estado, método de pagamento e valor (nunca morada, avaliação nem comentário); só contam pedidos entregues; pagos em dinheiro entram como `cash`. Na fatura semanal (IVA em autoliquidação, 0%) o «investimento na campanha» (negativo) entra no marketing, porque é a parte da campanha que a Bolt paga; as linhas têm de somar o total (tolerância de 2 cêntimos — a fatura real arredonda).
- **SAF-T:** guarda só faturado e IVA por dia e notas de crédito por dia (nunca clientes nem artigos); anulados não contam; confere a soma com `TotalCredit`/`TotalDebit` do próprio ficheiro; o SAF-T do Vendus é recusado (é do restaurante). Leitor próprio em vez do de `sales-declaration`: precisa do IVA e do bruto, que esse não lê.
- **Relatório de margem (F3):** o mesmo método do PDF de setembro — vendas com IVA → sem IVA pela taxa do SAF-T do mês (senão 15%, a de omissão da DRE); promoções contam como custo; taxas sem IVA (Bolt em autoliquidação); margem bruta; comida e embalagem estimadas em 30% do faturado sem IVA (até virem as fichas técnicas); margem líquida; IVA a entregar = IVA das vendas − IVA das taxas. % sobre as vendas sem IVA.
- **Documentos que atravessam o mês** (decisão do utilizador, 2026-10-28; `month-allocation.ts`): os que trazem os dias (pedidos da Bolt, SAF-T) contam só os dias do mês; as faturas da Bolt repartem-se pelas vendas diárias do relatório de pedidos; os outros pelo faturado diário do SAF-T (do mês e dos vizinhos); sem dados diários de todos os dias, pela proporção de dias, com aviso.
- **Conferência das transferências (F4):** esperadas = pagamentos dos documentos (semanas da Uber com a data de pagamento, quinzena da Glovo pelo «valor a transferir») e, na Bolt, vendas da semana (relatório de pedidos, sem as pagas em dinheiro) − total da fatura semanal. Contam as que terminam no mês. Cada uma liga-se ao crédito da mesma plataforma entre o fim do período e 21 dias depois, o de valor mais próximo (até 25% ou 5 € de diferença), cada crédito uma vez. Estados: bate (±2 cêntimos), diferença, por receber (o banco não está importado até à data limite), em falta. Créditos do mês sem transferência esperada listam-se à parte.
- **Custo real da comida e embalagem (F5, decisões do utilizador 2026-10-28):** o SAF-T guarda as vendas por produto e por dia (`products`; nunca clientes). Cada produto liga-se a uma ficha técnica e tamanho, a um artigo de stock, ao «Upgrade para L» ou a «ignorar» — mapeamento gravado, senão sugestão pelo nome (minúsculas, sem acentos, «&» = «e», sem «+» nem letras repetidas; «XS» e «Focaccia de …» → XS; bebidas pelo artigo com as mesmas palavras). Pizza = Pequena; cada upgrade soma a diferença Grande − Pequena (média pela mistura do mês). Embalagem: Caixa S por pizza pequena, Caixa L por upgrade, 1 saco e 1 guardanapo por pedido (artigos pelo nome, corrigíveis; chaves reservadas `@box_small`/`@box_large`/`@bag`/`@napkin`). Produtos sem custo estimam-se pela % dos outros. O relatório de margem (e a DRE) só usa a % real quando o custo está **completo** (todos os produtos ligados e com custo, fichas completas, embalagem com custo); senão fica nos 30% e diz a % parcial. Aviso quando o custo por unidade de embalagem passa 1 € (provável preço do pacote). A mesma % em todas as plataformas (o SAF-T não separa por plataforma).
- **Glovo:** as linhas de detalhe «Taxa de serviço da plataforma/estafetas» são ignoradas (já estão na comissão); a soma das taxas tem de dar o subtotal.
- **Validação ao cêntimo** contra o líquido do documento antes de guardar: um leitor que se engane rejeita em vez de gravar valores errados.
- **Faturas das plataformas não entram no módulo de faturas** — o extrato é a fonte da DRE.

## Como testar

- Domínio/casos de uso: `npx jest src/modules/delivery-platforms` (textos fictícios em `__tests__/fixtures`).
- Adapters: sem teste de integração (sem stack Supabase local nesta máquina).

## Lacunas conhecidas / dívida

- Relatórios de pedidos da Bolt com períodos sobrepostos somam-se duas vezes (o número é `PEDIDOS-<primeiro dia>-<último dia>`): importar um por mês.
- A DRE ainda reconstitui as plataformas pelo banco; passar a usar o relatório é a F3b.
- O custo da comida é uma hipótese (30%) até ligar às fichas técnicas (`recipe-costing`).
- Um período que atravessa meses (quinzena da Glovo) aparece nos dois meses; a repartição é da F3.
