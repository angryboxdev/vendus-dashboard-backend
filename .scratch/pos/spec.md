# POS do Mezza — Fase 1 (demonstração de 2026-11-07)

Status: fases 1 e 2 feitas no ramo (2026-11-05) — por publicar · Ramo: `faturacao-certificada` (worktrees backend e frontend)
Fonte: `Mezza_POS_Especificacao_Prototipo.md` (gerência, 2026-11-04) + decisões de 2026-11-05.

## Decisões (utilizador, 2026-11-05)
- Faturação: **documentos de formação reais** do motor `invoicing` (FR e NC assinadas, ATCUD, QR, «DOCUMENTO DE TESTE»). O Vendus continua oficial; nada se entrega a clientes.
- Fase 1 até sábado; stock (contador próprio do POS, movimentos e alertas) e preferência de vista por funcionário na fase 2.
- Gestores: PIN do quiosque de ponto (`hr_employees.kiosk_pin_hash`); quem é gestor marca-se nas configurações do POS.
- Isolado: não toca Vendus, AirMenu, DRE, Gestão de Stock nem menus. Frontend real do Mezza (Vite), não o protótipo Next.js.

## Âmbito da fase 1
1. **Produtos** (`Vendas → Produtos`): importar o CSV de exportação do Vendus com pré-visualização (ignora linhas a 0 € e duplicados por nome — fica a primeira com categoria; assinala IVA fora de 6/13/23 e o mesmo nome com IVA diferente); lista; editar preço, IVA, categoria e ativo.
2. **Configuração do POS**: série FR e série NC (de formação, com código de validação) e gestores.
3. **POS em ecrã inteiro** (`/pos`): PIN; vistas A (grelha) e B (lista) com troca rápida; categorias, pesquisa (sem acentos/maiúsculas); carrinho com −/+, desconto por linha e na venda (% ou €); pagamento Cartão/Dinheiro/MB Way (dinheiro com entregue, valores rápidos, teclado, troco); cliente NIF/nome opcional; emite **FR** e mostra o **talão de 80 mm** imprimível.
4. **Documentos do dia**; **nota de crédito** (só gestor por PIN): quantidades por linha até ao não creditado, motivo obrigatório, confirmação.
5. **Painel do dia**: vendas líquidas, n.º de vendas, NC, ticket médio, fecho por forma de pagamento (líquido de reembolsos).
6. Sair do POS só com PIN de gestor.

## Contrato da API (`/api/pos`, permissão `sales.invoicing`)
- `GET /pos/products` · `PUT /pos/products/:id` · `POST /pos/products/import/preview` `{csv}` · `POST /pos/products/import` `{csv}`
- `GET /pos/settings` · `PUT /pos/settings` `{invoiceSeriesRef, creditSeriesRef, managerEmployeeIds[]}` · `GET /pos/employees`
- `POST /pos/pin` `{pin}` → `{employeeId, name, isManager}`
- `POST /pos/sales` `{pin, lines[{productId, quantity, discount?{kind:"pct"|"eur", value}}], saleDiscount?, payment{method:"card"|"cash"|"mbway", given?}, customer?{taxId, name}}` (Idempotency-Key)
- `POST /pos/sales/:id/refund` `{pin, lines[{lineNumber, quantity}], reason}` (Idempotency-Key)
- `GET /pos/documents?date=` · `GET /pos/summary?date=`

## Fase 2 (feita no ramo, 2026-11-05)
1. **Stock próprio do POS** (não toca a Gestão de Stock): `pos_products.stock_qty` mantido por trigger a partir de `pos_stock_moves` (append-only: venda, devolução, entrada, contagem). A venda registada em `pos_sales` gera os movimentos dos artigos que controlam stock **na mesma transação**; a devolução devolve ao stock.
2. **Indicador** na grelha e na lista («N em stock» cinza, ≤ 2 âmbar, «Sem stock»/«Stock −N» vermelho; anel laranja ~4 s depois de mudar); «stock insuficiente» na linha do talão.
3. **Aviso antes de faturar**: lista dos artigos em falta, «Rever venda» / «Vender na mesma». Vender na mesma é permitido; o stock fica negativo e a venda é um **alerta de stock** (artigo, stock antes, vendido, funcionário, documento, hora) — derivado do movimento (venda com stock depois < 0).
4. **Gestão**: `Vendas → Produtos` com «Controla stock», stock, Entrada (+N) e Contagem (passa a N) com nota; quem fez fica no movimento.
5. **Painel**: alertas e movimentos de stock do dia.
6. **Vistas**: a escolha do funcionário fica no servidor (`pos_employee_prefs`) e volta ao entrar com o PIN; o gestor define a vista por omissão em `Vendas → Caixa (POS)`.
7. **Código de barras**: coluna «Código de Barras» do CSV (repetido → fica no primeiro, com aviso), editável na gestão (único por organização); o leitor funciona como teclado (teclas a < 50 ms + Enter) fora dos campos; na pesquisa, Enter com o código exato adiciona o artigo.

API nova: `POST /pos/products/:id/stock` `{kind: "entry", qty} | {kind: "count", countTo}`, `GET /pos/stock?date=`, `PUT /pos/view` `{pin, view}`; `PUT /pos/products/:id` aceita `trackStock` e `barcode`; `PUT /pos/settings` aceita `defaultView`; `POST /pos/pin` devolve `view`.

## Fora das fases 1 e 2
Ligação à Gestão de Stock (ficha técnica), TPA, impressora térmica direta, mesas/cozinha, offline, preço de delivery, multi-loja.

## Por confirmar
- Taxas de IVA do CSV (o mesmo artigo aparece a 13 % e 23 %; água a 6 %) — contabilista.
- Meio de pagamento SAF-T do MB Way (assumido `OU`) e do cartão (assumido `CD`, débito) — contabilista.
- Artigo devolvido com defeito volta ao stock? (hoje: toda a devolução volta; acertar com uma contagem) — gerência.
