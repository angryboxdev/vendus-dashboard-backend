# Module: pos

> Status: active (fase 1, em testes — documentos de formação)
> Last updated: 2026-11-05

---

## What it is and what it's for (business perspective)

A caixa do Mezza: o funcionário entra com o PIN do quiosque de ponto, escolhe os
produtos (com preço e IVA já definidos), aplica descontos, cobra em cartão,
dinheiro ou MB Way e sai a fatura-recibo com o talão. Um gestor faz notas de
crédito. No fim do dia, o painel mostra as vendas e o fecho por forma de pagamento.

**Enquanto o programa não está certificado pela AT, os documentos são de formação**
(«DOCUMENTO DE TESTE – SEM VALOR FISCAL»): o Vendus continua a ser o sistema
oficial e nada do POS se entrega a clientes.

**Key concepts for the business:**
- **Produto** — o que se vende na caixa (referência, nome, categoria, preço com IVA, taxa de IVA). Importado da exportação do Vendus (CSV) ou editado à mão. Não é o artigo de stock.
- **Venda** — uma fatura-recibo (FR) do módulo `invoicing`, ligada ao funcionário e ao meio de pagamento.
- **Devolução** — uma nota de crédito (NC) sobre uma venda, só por gestor, com motivo.

---

## Technical purpose

Gere produtos, configuração (séries FR/NC, gestores) e o registo das vendas e
devoluções da caixa. Não emite documentos fiscais: pede-os ao `invoicing` por
funções ligadas no `server.ts`. Não toca Vendus, AirMenu, DRE, Gestão de Stock
nem menus.

## Domain concepts

- `PosProduct`, `PosSettings`, `PosEmployee`, `PosSaleRecord` / `SoldLine` (`domain/entities/pos.ts`).
- `previewVendusCsv` — lê a exportação do Vendus (aspas, vírgula decimal): ignora linhas a 0 € (modificadores, cupões, ofertas) e duplicados pelo nome (fica a primeira com categoria); assinala IVA diferente entre duplicados, «Duplicado» no nome, tipo «C», sem categoria; recusa IVA fora de 6/13/23.
- `priceSale` — cêntimos com IVA; desconto por linha e na venda (% ou €), o da venda repartido ao cêntimo (`distribute`); cada linha leva ao documento uma percentagem com 6 casas que reproduz o total ao cêntimo (`discountPctFor`).
- Meio de pagamento SAF-T: cartão → `CD`, dinheiro → `NU`, MB Way → `OU` (a confirmar com o contabilista).

## Ports

### Input
- `PosPort` (`PosUseCases`): produtos (listar, pré-visualizar e importar CSV, editar), configuração e funcionários (gestores), `login` (PIN), `checkout` (FR), `refund` (NC parcial por linha), `documents` e `summary` do dia (Lisboa).

### Output
- `PosStorePort` — produtos, configuração, registo append-only das vendas.
- `InvoicingGatewayPort` — emitir FR/NC e ler o cliente do documento (módulo `invoicing`).
- `PosEmployeesPort` — funcionários ativos e PIN do quiosque (`hr_employees`, só leitura).
- `PosClockPort` — dia de Lisboa e os seus limites em UTC.

## Adapters

### Input
- `createPosRouter` → `/api/pos` (permissão `sales.invoicing`: GET = READ, resto = MANAGE). Vendas e devoluções exigem `Idempotency-Key`:
  - `GET /pos/products?active=1` · `PUT /pos/products/:id` · `POST /pos/products/import/preview` `{csv}` · `POST /pos/products/import` `{csv}`
  - `GET|PUT /pos/settings` `{invoiceSeriesRef, creditSeriesRef, managerEmployeeIds}` · `GET /pos/employees`
  - `POST /pos/pin` `{pin}` → `{id, name, isManager}`
  - `POST /pos/sales` `{pin, lines[{productId, quantity, discount?}], saleDiscount?, payment{method, givenCents?}, customer?}` → 201 venda
  - `POST /pos/sales/:id/refund` `{pin, lines[{lineNumber, quantity}], reason}` → 201 devolução
  - `GET /pos/documents?date=` · `GET /pos/summary?date=`
  - Erros: 400, 403 `pos_pin` (PIN errado, não é gestor, demasiadas tentativas), 404, 422 `pos_rule` (inclui recusas fiscais do `invoicing`).

### Output
- `SupabasePosStore` (`pos_products`, `pos_settings`, `pos_sales`), `InvoicingGateway` (funções do `invoicing`, erros fiscais → `PosRuleError`), `KioskPinEmployees` (HMAC do quiosque injetado), `LisbonDayClock`.

### Base de dados (`20261221100000_pos_phase1.sql`)
- `pos_products` (referência única por organização, IVA 6/13/23, imagem só https), `pos_settings`, `pos_sales` (append-only por trigger e privilégios; FK ao documento fiscal da mesma organização; devolução exige venda original e motivo). Escrita só pelo backend, leitura por organização (RLS).
- Validada em PGlite: 15 verificações (`.scratch/pos/validate-pos.mjs`).

## Design decisions (ADR summary)
- **Documentos de formação reais**, não simulação (decisão do utilizador, 2026-11-05): o POS testa a cadeia fiscal inteira (assinatura, ATCUD, QR, SAF-T).
- **PIN do quiosque de ponto** em cada venda/devolução; gestores marcados na configuração do POS. Até 10 PINs errados por organização em 5 min (memória — uma instância do servidor).
- **Lê `hr_employees` diretamente** (como o fecho de caixa), só `id`, `full_name`, `status`, `kiosk_pin_hash` — o RH não expõe uma porta de PIN; mover para uma porta do RH quando existir.
- **Registo da venda depois do documento**: se a gravação em `pos_sales` falhar, a FR já existe e o erro diz o número (não há transação entre módulos).
- **Stock fora da fase 1** (contador próprio do POS na fase 2; não toca a Gestão de Stock).

## How to test
```sh
VENDUS_BASE_URL=https://vendus.example.invalid AIRMENU_ENTERPRISE_ID=0 AIRMENU_SALES_SUMMARY_ENTERPRISE_ID=0 \
CREDENTIALS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
npx jest --config jest.config.cjs src/modules/pos
```
`invoicing-gateway.test.ts` usa o caso de uso real de emissão (com fakes) para provar que o total da FR é o do POS.

## Known gaps / open debt
- Fase 2: stock por produto (movimentos, alertas de venda sem stock), preferência de vista por funcionário, código de barras.
- IVA de alguns artigos no CSV do Vendus diverge entre linhas (ex.: refrigerantes 13 %/23 %) — confirmar com o contabilista.
- Sem permissão própria (`sales.invoicing`); sem multi-loja (uma série FR/NC por organização).
