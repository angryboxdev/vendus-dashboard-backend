# Importador dos extratos das plataformas de delivery e relatório por plataforma

> Ramo: `financeiro-conferencia-vendas` (backend e frontend).
> Aberto em 2026-10-28. Desenho validado com os extratos reais de setembro de 2026 (Uber, Glovo, Bolt,
> SAF-T do AirMenu), que ficam **fora do repositório**; os testes usam dados fictícios.

## Objetivo

Substituir a reconstituição do delivery pelo banco (taxas por parâmetro) pelos **valores reais** de cada
plataforma: vendas, promoções, comissões, marketing, reembolsos e valor transferido. Com eles:

1. a DRE usa os números reais do delivery;
2. um **relatório por plataforma** (ecrã + Excel) mostra a margem que cada uma deixou;
3. a conferência liga cada transferência no banco ao período que paga.

## Decisões do utilizador (2026-10-28)

- **Importar só o essencial** (lista abaixo). Relatórios diários e o CSV da Glovo ficam de fora.
- **Promoções = custo**, pelo valor que a plataforma indica (incluindo «compre um, leve outro»). Não se
  calcula o custo real do item oferecido.
- **Relatório por plataforma de delivery**, com exportação.
- **Bolt** entra com o CSV de pedidos e as faturas semanais.
- **SAF-T do AirMenu**: recomendado (IVA exato das vendas e verificação de pedidos em falta), opcional.
- Nunca guardar dados de clientes (nomes, NIF, notas de pedido, comentários de avaliação).
- **Extratos que atravessam o mês** (2026-10-28): um extrato pode trazer dias do mês anterior ou do
  seguinte. O SAF-T do AirMenu, que tem as vendas dia a dia, diz que parte pertence a cada mês: os dias
  fora do mês ficam de fora (ou vão para o mês deles) na proporção do faturado no SAF-T nesses dias.

## O que se importa (por mês)

| Plataforma | Documento | Quantos | Lido de |
|---|---|---|---|
| Uber | Extrato mensal (PDF, «Resumo mensal consolidado» + «Pagamentos recebidos no mês») | 1 | `pdf-parse` (já é dependência) |
| Glovo | Extrato quinzenal (PDF `I26UP…`, fatura + valor a transferir) | 2 | `pdf-parse` |
| Bolt | Relatório de pedidos (CSV `…_orders_report_…`) | 1 | CSV |
| Bolt | Fatura semanal (PDF `PT1426-…`, autoliquidação de IVA) | 4–5 | `pdf-parse` |
| AirMenu | SAF-T PT 1.04 (opcional) | 1 | leitor de `sales-declaration` |

O tipo de cada ficheiro é reconhecido pelo conteúdo (não pelo nome). Cada documento é identificado pelo
número (n.º do extrato / fatura; referência do pedido na Bolt; `InvoiceNo` no SAF-T): importar outra vez
substitui, nunca duplica.

### Campos lidos

**Uber — extrato mensal** (mês civil): vendas (n.º de pedidos), gratificações, taxas de mercado (comissão
30% + IVA 23% sobre a venda depois das ofertas — confirmado), outros débitos, ofertas em artigos, ajuste
de marketing, outras taxas da oferta, despesas com anúncios, créditos de anúncio, estornos, ajustes,
total líquido; por semana paga: período, data do depósito, vendas, taxas, marketing, alterações,
pagamento líquido.

**Glovo — extrato quinzenal** (`Serviço prestado entre … e …`, sempre 1–15 ou 16–fim do mês): taxa de
acesso à plataforma (comissão), espera de estafetas, manutenção, Prime, marketing promocional (anúncios),
ofertas Flash, IVA 23%, total da fatura; produtos, promoção de produtos e promoção Flash pagas pelo
parceiro, incidentes, pagamentos em dinheiro, dívida acumulada, **valor a transferir**.

**Bolt — CSV de pedidos**: referência, estado, data, total bruto, comissão (%). Ignorar comentários.

**Bolt — fatura semanal** (segunda a domingo): comissão semanal, comissão Bolt Plus, investimento na
campanha (negativo), taxa da campanha, custos cofinanciados, deduções dos reembolsos, total. **IVA em
autoliquidação** (0% na fatura): o custo para a DRE é o total; o IVA liquida-se e deduz-se (neutro).

## Mês de cada valor

- Uber: o extrato já é do mês civil.
- Glovo: as quinzenas caem dentro do mês.
- Bolt: as faturas são semanais e uma semana pode atravessar o mês. Os valores da fatura repartem-se
  pelos meses **na proporção das vendas** dessa semana em cada mês (datas dos pedidos do CSV).
- Qualquer extrato que atravesse o mês (quinzena da Glovo, semana da Bolt): repartir pelos dias com o
  faturado diário do SAF-T (decisão do utilizador, 2026-10-28); sem SAF-T desses dias, pela proporção de
  dias e assinalado como estimativa. A conferência «SAF-T × extratos» passa a usar só a parte do mês (F3).
- Transferências: ligadas ao período que pagam (semana Uber, quinzena Glovo, semana Bolt), não ao dia
  em que entram no banco.

## Relatório por plataforma (ecrã + Excel)

Por plataforma e mês (e total do delivery):

| Linha | Uber | Glovo | Bolt |
|---|---|---|---|
| Pedidos | extrato | n.º de linhas do extrato | CSV |
| Vendas de tabela (com IVA) | vendas | produtos | total bruto |
| (−) Promoções | ofertas em artigos + outras taxas da oferta | promoção de produtos + Flash | investimento na campanha (*) |
| (−) Comissões | taxas de mercado | taxa de acesso + Prime | comissão semanal + Bolt Plus |
| (−) Marketing / anúncios | despesas com anúncios − créditos | marketing promocional + taxas Flash | taxa da campanha + cofinanciados |
| (−) Reembolsos e outras taxas | estornos, ajustes | espera, manutenção, incidentes | deduções dos reembolsos |
| = Margem da plataforma | € e % das vendas | | |
| Recebido (transferências) | | | |
| Ticket médio, margem por pedido | | | |

(*) Sinal e significado do «investimento na campanha» da Bolt a confirmar (ver perguntas).

Valores com e sem IVA: vendas sem IVA pelo SAF-T (quando importado) ou pelo IVA médio do mês; taxas
sem IVA (Uber/Glovo 23%; Bolt autoliquidação). Exportação em Excel (`xlsx`, já é dependência).

## DRE

Para cada plataforma e mês com extrato importado, a DRE usa os valores reais (receita = vendas −
promoções; custos = comissões, marketing, reembolsos e taxas). Sem extrato, mantém a reconstituição
atual pelo banco, assinalada como estimativa.

## Arquitetura

Módulo novo `delivery-platforms` (backend e frontend), hexagonal como `tasks`:

- domínio puro: leitores do texto dos PDF/CSV → documentos normalizados; repartição semanal por mês;
  cálculo do relatório.
- adapters de saída: tabela(s) novas (migração com rollback, `org_id` + RLS, registadas no
  `table-registry`), extração de texto de PDF.
- `cash-flow` lê os totais por plataforma e mês através de uma porta de entrada de `delivery-platforms`
  (ligada em `src/server.ts`).
- Rotas novas classificadas na matriz: importar (`dre.statement` MANAGE), ler/relatório/exportar
  (`dre.statement` READ).

## Fases

1. **F1** — migração (extratos e linhas por período, sem dados de clientes), leitores dos PDF da **Uber**
   e da **Glovo**, `POST /api/delivery-platforms/import` (vários ficheiros, idempotente) e lista dos
   extratos importados; ecrã «Importar extratos das plataformas».
2. **F2** — **Bolt** (CSV + faturas semanais, repartição pelos meses) e **SAF-T** do AirMenu (opcional).
3. **F3** — dividida em **F3a** relatório por plataforma (ecrã + Excel + PDF, repartição pelo SAF-T diário) e
   **F3b** DRE com os valores reais.
4. **F4** — conferência do delivery: transferências no banco × período pago (feita 2026-10-28).
5. **F5** — custo real da comida e da embalagem: produtos do SAF-T × fichas técnicas e artigos de stock
   (pizza = Pequena, «Upgrade para L» = diferença Grande − Pequena; Caixa S/L por pizza, saco e guardanapo
   por pedido — decisões do utilizador 2026-10-28); a margem usa a % real só quando completa.

Cada fase termina com relatório e espera autorização. Migração em produção só com aprovação explícita.

## Perguntas em aberto

1. Uber: as «despesas com anúncios» incluem IVA? (a comissão inclui — confirmado pelos 36,9%).
2. Bolt: «investimento na campanha» (negativo) é o desconto que a Bolt cofinancia/devolve? Ver com uma
   fatura de mês com campanha e o pagamento correspondente.
3. Pedidos reembolsados (Bolt «deduções dos reembolsos»; Uber «estornos»): a fatura do SAF-T mantém-se —
   precisa de nota de crédito? (contabilista)
4. Autoliquidação do IVA da Bolt: confirmar o tratamento com o contabilista.
