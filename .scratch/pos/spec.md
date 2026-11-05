# POS do Mezza — Fase 1 (demonstração de 2026-11-07)

Status: em curso (2026-11-05) · Ramo: `faturacao-certificada` (worktrees backend e frontend)
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

## Fora da fase 1
Stock e alertas, preferências de vista, leitor de código de barras, TPA, mesas/cozinha, offline, preço de delivery.

## Por confirmar
- Taxas de IVA do CSV (o mesmo artigo aparece a 13 % e 23 %; água a 6 %) — contabilista.
- Meio de pagamento SAF-T do MB Way (assumido `OU`) e do cartão (assumido `CD`, débito) — contabilista.
