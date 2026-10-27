# Módulo: cash-flow

> Status: active
> Última atualização: 2026-10-27 (DRE: delivery em bruto sem AirMenu, parâmetros mensais, IVA estimado dos gastos; conferência de vendas Vendus × banco). Antes: 2026-10-26 (fluxo de caixa só a partir do banco; «Para tratar»; DRE F1 pela conciliação bancária)

---

## O que é e para que serve (perspetiva de negócio)

O ecrã «Fluxo de caixa» do Mapa de rentabilidade: num mês, quanto entrou e saiu das contas
bancárias, o resultado, em que é que se gastou (por centro de custo) e quanto das saídas já está
justificado.

**O problema que resolve:**
Os movimentos estão espalhados pelos extratos de cada conta, e a categoria das despesas está nas
faturas conciliadas. Sem este módulo não há uma vista única do mês nem se sabe quanto das saídas
ainda está por explicar.

**O fluxo do ponto de vista do negócio:**

```
Gerente                                   Sistema
──────────────────────                    ──────────────────────
1. Abre Mapa → Fluxo de caixa         →   2. Junta entradas e saídas de todas as contas
                                          3. Categoriza cada saída (movimento → faturas → recorrência)
4. Vê «Transferência enviada» por     ←   5. Mostra as saídas sem categoria pelo tipo do banco
   classificar
6. Concilia-a com a fatura de salários →  7. Na próxima leitura conta em Pessoal · Salários
```

**Conceitos-chave para o negócio:**

- **Entradas** — créditos de todas as contas bancárias da organização (vendas TPA, plataformas, transferências recebidas…).
- **Saídas** — débitos de todas as contas.
- **Resultado** — entradas − saídas. **Margem** — resultado ÷ entradas.
- **Despesas por categoria** — por grupo de centro de custo (ex.: Pessoal), com o detalhe por categoria (Salários, Encargos).
- **Por classificar** — saídas sem categoria, agrupadas pelo tipo genérico do banco (ex.: «Transferência enviada»).
- **% justificada** — valor das saídas conciliadas/justificadas ÷ valor total das saídas.

---

## Propósito técnico

Expõe um relatório só de leitura, `GET /api/reports/dre/fluxo-caixa?year&month`. Não grava nada:
não altera movimentos, faturas nem categorias. A conciliação e a classificação continuam em
`bank-statements`. Não usa o Vendus (as vendas por canal ficam para a DRE).

## Conceitos de domínio

- `BankDebit` / `BankCredit` — saída / entrada do banco com o tipo genérico; a saída tem ainda a categoria própria (se tiver) e as ligações a documentos.
- `ExpenseSources` — faturas (cabeçalho, linhas, repartições), contas a pagar e ocorrências de recorrência com a respetiva categoria.
- `CashFlowReport` — período, séries diárias (atual e anterior), totais, entradas por tipo, categorias e justificação.

**Regras:**

- **Categoria de uma saída**, por prioridade (`categorizeDebit`):
  1. a do próprio movimento (classificação manual ou regra recorrente);
  2. a dos documentos conciliados (`bank_movement_entity_links`), na proporção do valor ligado a cada um. Na fatura: «Por valores» → repartições; «Por artigo» → linhas (sem categoria → cabeçalho); «Única» → cabeçalho. Conta a pagar → a fatura dela, senão o grupo;
  3. o documento do match único (`matched_entity_type`): fatura, conta a pagar ou ocorrência de recorrência (→ fatura da ocorrência, senão a categoria do contrato);
  4. nenhuma → «por classificar», pelo tipo genérico do banco.
- O grupo sai sempre da categoria quando esta é conhecida. Um grupo fora do catálogo conta como sem categoria.
- **Fora do relatório:** transferências internas e empréstimos (entradas e saídas: estado, justificação ou tipo) e as saídas do grupo «Fora da DRE» (`FDR`).
- **Justificada:** estados resolvidos contam inteiros; `conciliado_parcial` conta o valor ligado a documentos.
- **Período:** mês corrente até hoje, comparado com os mesmos dias do mês anterior; mês fechado inteiro, comparado com o mês anterior inteiro. Mês futuro → 400.

- **Para tratar** (estado atual, não depende do mês): contas a pagar em aberto e em atraso (resumo de `payable-entries`) e faturas por rever (`pendingReviewCount` dos alertas de `invoices`).

### DRE (pela conciliação bancária)

Decisões do utilizador (2026-10-26, revistas a 2026-10-27): a DRE parte da conciliação bancária,
tudo **sem IVA**; o objetivo é saber se a empresa dá lucro. Sem AirMenu.

- **Receita — restaurante:** Vendus (canais salão/take-away/Eatz, sem o antigo «apps»), com o IVA exato dos documentos; repartida em «Venda restaurante cartão / dinheiro / outros» na proporção do bruto por classe de pagamento (`restaurantByPayment`).
- **Receita — plataformas, em bruto** (`platformGross`): a plataforma liquida no banco já sem a comissão (com IVA por cima) e sem o marketing (com IVA). Com R = recebido, M = marketing sem IVA (lançado à mão), c = comissão, t = IVA da comissão, v = IVA médio das vendas, m = IVA do marketing: G = (R + M·(1+m)) ÷ (1 − k), k = c·(1+t) (comissão sobre a venda com IVA) ou c·(1+t)/(1+v) (sem IVA). Receita = G ÷ (1+v). Por plataforma mostra também a **margem** (venda sem IVA − comissão − marketing). Exemplo: R = 631 € → G = 1000 €, receita 869,57 €, comissão 300 € (+69 € IVA). Uma plataforma só com marketing lançado também aparece.
- **Custos das plataformas:** comissão e marketing sem IVA — linha própria, abatida no resultado; o IVA deles conta como dedutível.
- **Parâmetros mensais** (`dre_monthly_parameters`; `GET|PUT /reports/dre/parametros`): IVA médio do delivery (15), comissão (30), IVA da comissão (23), comissão sobre a venda com IVA (sim), IVA do marketing (23), taxa do TPA (1, usada na conferência), IVA teórico dos gastos (23) e marketing por plataforma. Mês sem linha → herda as taxas do último mês com linha (sem o marketing); sem nenhuma → valores de omissão (`source`). A base da comissão e o IVA do marketing ficaram parâmetros por confirmar com um extrato real da Uber.
- **Gastos:** as mesmas saídas e categorias do fluxo de caixa (mesmas exclusões). Sem IVA, pelo melhor que se sabe: (1) categoria sem IVA (tipos financeiros `personnel`, `financial`, `fiscal`; grupo isento se todas as suas categorias o forem) → tudo; (2) **real** — fatura conciliada (linhas «Por artigo» com o seu; repartições com o da fatura), na parte ligada a ela, ou IVA posto no movimento; (3) **estimado** — rácio das últimas 10 faturas da categoria (ex.: Ingredientes ≈ Makro; ponderado pelo valor, sem rascunhos nem anuladas) ou, sem histórico, o IVA teórico do mês para qualquer saída com categoria/grupo; (4) sem categoria → valor total, **«IVA por confirmar»**. Conciliar com a fatura altera logo o valor (calculado na leitura).
- **Ajustes manuais:** custos fixos e variáveis lançados à mão nas páginas antigas do Mapa (`dre_custos_fixos` / `dre_custos_variaveis`, `valor_sem_iva`), somados.
- **Resultado** = receita − custos das plataformas − gastos − ajustes; **margem** = resultado ÷ receita.
- **IVA:** das vendas (Vendus + plataformas reconstituídas) − dedutível (gastos real + estimado, comissões e marketing) = estimativa a entregar; `purchasesEstimatedCents` diz quanto é estimado.

### Conferência de vendas (Vendus × banco)

Decisões do utilizador (2026-10-27; spec `.scratch/conferencia-vendas-dre/spec.md`): a venda do
restaurante tem competência no Vendus; o banco serve para conferir, e um dia de diferença é normal.

- **Entradas do restaurante no banco** (`restaurantSale` do leitor do extrato): «Venda restaurante cartão» = créditos TPA e Unicre; «Venda restaurante dinheiro» = todos os depósitos.
- **Cartão — liquidações:** os créditos TPA somam-se por dia; cada um cobre as vendas em cartão do Vendus desde o dia do crédito anterior até à véspera do seu (venda em D, crédito em D+1; o crédito de segunda junta o fim de semana). Taxa implícita = (vendido − recebido) ÷ vendido; «ok» se a ±0,5 p.p. da taxa esperada (1%), senão «check»; crédito sem vendas → «no_sales». Uma liquidação conta no mês do seu **último dia de venda** (o crédito de dia 1 paga o mês anterior).
- **Janela:** vendas desde 7 dias antes do mês; créditos até 7 dias depois do fim (sem passar de hoje). O primeiro crédito da janela não tem anterior — cobre desde o início da janela.
- **Por liquidar:** vendas em cartão depois do último crédito, até ao fim do período.
- **Numerário:** vendido no mês × depositado no mês (positivo = por depositar); cada depósito mostra o numerário vendido desde o depósito anterior até à véspera.
- **Fora:** créditos excluídos do fluxo de caixa (transferências internas, empréstimos); Eatz, Apps e outros métodos do Vendus (MB Way…).

## Portas

### Entrada (casos de uso)

- `GetDrePort` — DRE do mês (`{ organizationId, year, month }`).
- `GetSalesReconciliationPort` — conferência de vendas do mês (`{ organizationId, year, month }`).
- `GetDreParametersPort` / `SaveDreParametersPort` — parâmetros mensais da DRE (ler resolvidos; gravar validados).

- `GetCashFlowPort` — relatório do mês (`{ organizationId, year, month }`).
- `GetCashFlowToHandlePort` — painel «Para tratar» (`{ organizationId }`).

### Saída (dependências do domínio)

- `BankMovementReadPort` — débitos (com ligações a documentos) e créditos de todas as contas da organização num intervalo.
- `ExpenseSourceReadPort` — categoria das faturas, contas a pagar e ocorrências referidas.
- `CostCenterCatalogReadPort` — grupos e categorias de centro de custo.
- `MovementKindPort` — tipo genérico de um movimento a partir do descritivo do banco.
- `PayablesSummaryReadPort` — total a pagar em aberto e em atraso (cêntimos).
- `InvoicesToReviewReadPort` — número de faturas por rever.
- `RestaurantSalesReadPort` — vendas do restaurante (sem IVA + IVA, bruto por classe de pagamento) num intervalo.
- `DreParametersRepositoryPort` — parâmetros do mês e do último mês anterior com valores; gravar.
- `CategoryVatRatioReadPort` — rácio sem IVA das últimas faturas de cada categoria.
- `ManualAdjustmentsReadPort` — custos fixos/variáveis lançados à mão no mês.
- `RestaurantDailyPaymentsReadPort` — vendas do restaurante por dia em cartão e numerário (Vendus).

## Adapters

### Entrada

- `CashFlowController` → `GET /reports/dre/fluxo-caixa`, `GET /reports/dre/resultado`, `GET /reports/dre/conferencia-vendas` e `GET /reports/dre/parametros` (permissão `dre.statement`, READ), `PUT /reports/dre/parametros` (`dre.statement`, MANAGE) e `GET /reports/dre/fluxo-caixa/para-tratar` (permissão `finance.payables`, READ).

### Saída

- `SupabaseBankMovementReadAdapter` → `bank_movements` (paginado) + `bank_movement_entity_links`.
- `SupabaseExpenseSourceReadAdapter` → `invoices`, `invoice_lines`, `invoice_allocations`, `payable_entries`, `recurring_occurrences`, `recurring_contracts`.
- `SupabaseCostCenterCatalogReadAdapter` → `cost_center_groups`, `cost_center_categories`.
- `BankStatementsMovementKindAdapter` → `DescribeMovementPort` do módulo `bank-statements`.
- `PayableEntriesSummaryAdapter` → `GetPayableSummaryPort` do módulo `payable-entries`.
- `InvoiceAlertsToReviewAdapter` → `GetInvoiceAlertsPort` do módulo `invoices`.
- `VendusRestaurantSalesAdapter` → `GetSummaryPort` do módulo `vendus` (euros → cêntimos; sem o canal «apps»; bruto por classe de `byPaymentMethod`).
- `SupabaseManualAdjustmentsReadAdapter` → `dre_custos_fixos`, `dre_custos_variaveis` (só leitura).
- `SupabaseDreParametersRepository` → `dre_monthly_parameters` (a única tabela que este módulo escreve).
- `SupabaseCategoryVatRatioReadAdapter` → `invoices` (cabeçalho, só leitura; até 2000 mais recentes).
- `VendusDailyPaymentsAdapter` → `GetSummaryPort` do módulo `vendus` (`analytics.dailyPayments`, euros → cêntimos; Eatz, Apps e outros métodos ficam de fora).

## Decisões de design

- **«Para tratar» num endpoint à parte, com a permissão de Contas a pagar.** São valores de outra área (Financeiro); quem só vê o Mapa (`dre.statement`) recebe 403 e o frontend esconde o painel. Reutiliza os mesmos números de Contas a pagar e dos alertas das faturas — nunca os recalcula.

- **Só o banco (decisão do utilizador, 2026-10-26).** O extrato já mostra as entradas (TPA, plataformas…); o Vendus não entra neste ecrã — fica para a DRE.
- **Categoria calculada na leitura, não gravada no movimento.** Conciliar uma saída muda logo a categoria no relatório, vale para os meses já conciliados e não exige migração. Desfazer uma conciliação também se reflete sem sincronização.
- **Leitura direta das tabelas de outros módulos (só leitura).** É uma vista de relatório que cruza banco, faturas, recorrências e catálogo; ler por portas de entrada exigiria quatro portas novas só para isto. Segue o precedente de `payable-recurrences` (lê `bank_movements`). Nunca escreve nessas tabelas.
- **Tipo genérico pelo `bank-statements`.** As regras do descritivo vivem num só sítio (`normalizeMovement`); este módulo recebe-as pela porta `DescribeMovementPort` e devolve só a chave (`transfer_out`, `sales`…). O nome legível fica no frontend (`MOVEMENT_KIND_LABELS`).
- **Delivery em bruto pelo banco, sem AirMenu (decisão do utilizador, 2026-10-27).** O AirMenu deixa de alimentar a DRE: o banco é a fonte do que entra e as taxas (comissão, IVA) são parâmetros do mês, editáveis. O bruto é uma reconstituição — fica tão certo quanto as taxas; quando a fatura de comissão da plataforma for conciliada, o real pode substituir a estimativa (ainda não feito).
- **IVA estimado em vez de um botão «teórico / aproximado».** Cada saída conta sempre pelo melhor IVA disponível (real → média da categoria → teórico → por confirmar) e o relatório diz quanto é estimado; não há modos a alternar.
- **% justificada por valor, não por número de movimentos** (ao contrário de `reconciledPercent` em `bank-statements`): uma saída grande por explicar pesa mais do que muitas pequenas.

## Como testar

- Domínio e caso de uso: `npx jest --config jest.config.cjs src/modules/cash-flow` (rápido, com fakes).
- Adapters: sem testes de integração (precisam da stack Supabase local).

## Lacunas conhecidas

- DRE: o bruto das plataformas depende das taxas do mês (comissão sobre a venda com/sem IVA e IVA do marketing por confirmar com um extrato real); a liquidação pode cair no mês seguinte ao da venda. As vendas do Vendus são pedidas ao vivo (sem cache) — pode demorar alguns segundos.
- DRE: o IVA teórico aplica-se a qualquer saída com categoria sem faturas na categoria — categorias com IVA diferente (seguros, rendas isentas) ficam certas só com fatura conciliada ou IVA posto no movimento.
- Ainda sem ecrã para editar os parâmetros nem para a conferência de vendas (F4).

- O mês só está completo quando todos os extratos das contas estão importados; não há aviso de contas em falta.
- Contas a pagar só têm grupo (sem categoria): sem fatura, ficam no grupo sem detalhe.
