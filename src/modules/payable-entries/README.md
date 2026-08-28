# Módulo: payable-entries

> Status: ativo
> Última atualização: 2026-08-28

---

## O que é e para que serve (perspectiva de negócio)

Todos os meses a Angrybox tem despesas a pagar — electricidade, internet, fornecedores
de ingredientes, plataformas, rendas. Sem um sistema centralizado, o manager não sabe
ao certo o que falta pagar, o que já foi pago nem o que está em atraso.

Este módulo é a **lista de contas a pagar** do negócio. Regista cada despesa pendente,
acompanha o seu vencimento e marca-a como paga quando o pagamento é efectuado.

**O problema que resolve:**
Sem este controlo, uma conta pode passar despercebida até chegar a carta de aviso ou
corte de serviço. Não há visibilidade sobre o total de compromissos financeiros do mês
nem sobre o que já foi gasto. Este módulo responde às perguntas: *Quanto devo?*
*A quem?* *Quando vence?* *O que já paguei este mês?*

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────────────────
OPÇÃO A — Despesa sem fatura (ex: renda, subscrição)
  1. Manager cria entrada manualmente:
     fornecedor, descrição, montante, data de vencimento
  2. A entrada fica em estado "Pendente"
  3. Quando paga, manager regista a data de pagamento
     → estado passa para "Paga"

OPÇÃO B — Fatura de fornecedor registada no sistema
  1. Manager regista a fatura no módulo Faturas
     (inclui data de vencimento)
  2. O sistema cria automaticamente a entrada de conta a pagar,
     ligada à fatura, copiando fornecedor, valor e vencimento
  3. Quando a fatura é marcada como paga, a conta a pagar
     sincroniza automaticamente → estado passa para "Paga"
  4. Se a fatura for cancelada, a conta a pagar
     é cancelada em simultâneo

Se a data de vencimento passar sem pagamento, o sistema
assinala a entrada como "Vencida" e destaca-a nos KPIs.
```

**Conceitos-chave para o negócio:**

- **Conta a pagar** — registo de uma despesa com montante e data limite de pagamento.
  Pode ter origem numa fatura de fornecedor (associada por `invoiceId`) ou ser um
  registo manual sem fatura. O montante está sempre em cêntimos.
- **Vencimento** — data até à qual o pagamento deve ser efectuado. O sistema calcula
  automaticamente quais as entradas vencidas e mostra o total em destaque nos KPIs.
- **"A Pagar" vs "Pagas"** — a vista "A Pagar" mostra todas as entradas pendentes e
  vencidas (o que ainda falta pagar); a vista "Pagas" mostra o histórico de pagamentos.
- **Recorrência** — indica se a despesa se repete (mensal, trimestral, anual). É um
  metadado que ajuda o manager a saber o que esperar no próximo período. A criação
  automática de entradas futuras não está implementada nesta fase.
- **KPIs** — totais calculados automaticamente: total a pagar, total vencido, a vencer
  nos próximos 7 dias, pago este mês. Dão ao manager uma leitura rápida da situação
  financeira corrente.

---

## Propósito técnico

Registo e acompanhamento de **contas a pagar**: faturas de fornecedores com data de vencimento, despesas recorrentes e pagamentos manuais sem fatura associada.

Não é responsável por conciliação bancária (módulo `bank-statements`) nem por relatórios financeiros agregados (módulo `financial-reports`).

## Conceitos do domínio

**PayableEntry** — entrada de contas a pagar. Pode ter origem numa fatura (`invoiceId` preenchido) ou ser um registo manual (`invoiceId` nulo). O `amount` é sempre em centavos (inteiros). Invariantes:

- Montante > 0.
- Só transita para `paid` a partir de `pending` ou `overdue`.
- Só transita para `cancelled` a partir de `pending` ou `overdue` (não de `paid`).
- Só pode ser eliminada quando `cancelled`.
- Não pode ser editada quando `cancelled`.

**RecurrenceType:** `none | monthly | quarterly | annual` — indica se a despesa se repete. A criação automática de entradas recorrentes futuras está fora do âmbito desta fase.

**PayableStatus:** `pending | paid | overdue | cancelled`

**PayableSummaryService** — serviço de domínio puro que calcula KPIs (totalDue, totalOverdue, dueSoon7Days, paidThisMonth) e agrupa entradas por dia para a vista calendário.

---

## Isolamento por organização (spec B2)

Este módulo segue o padrão estabelecido pelo piloto `bank-accounts` (ticket 02
da spec `.scratch/scoped-access/spec.md`, D2, ADR-0008) — a organização passa
explicitamente por todo o caminho, em vez de confiar num client Supabase sem
filtro. O README de `bank-accounts` documenta o estilo completo; aqui fica o
resumo aplicado a este módulo:

- **Output ports**: `organizationId: OrganizationId` é sempre o **primeiro
  parâmetro, separado**, em todos os métodos de `PayableEntryRepositoryPort` e
  `InvoiceReadPort` — nunca um campo dentro de um objecto de filtro (D2).
- **Input ports (use cases)**: `organizationId` viaja como **campo dentro do
  objecto de comando/query** que o `execute()` já recebia. Um port que antes
  recebia um primitivo isolado (`execute(id: string)`, `execute(filter?: ...)`)
  passou a receber sempre um objecto obrigatório com esse campo mais
  `organizationId` — `CancelPayableEntryCommand`, `GetPayableEntryQuery` e
  `DeletePayableEntryCommand` são novos por essa razão; `ListPayableEntriesFilter`
  deixou de ser opcional porque passou a exigir `organizationId`.
- **Controller**: lê de `req.auth!.orgId` (populado pelo middleware de auth a
  partir do claim verificado) e coloca-o no comando/query — nunca do body ou
  de params. Nos endpoints de escrita, o campo é espalhado **depois** do
  corpo do pedido (`{ ...req.body, organizationId: req.auth!.orgId, id: ... }`)
  para que um payload com `organizationId` nunca sobreponha o valor do
  chamador.
- **Adapters**: recebem o `ScopedQueryFactory` (`createScopedQuery`) no
  construtor, não um `SupabaseClient`, e chamam
  `this.scopedQuery(organizationId).table(...)` por operação — ver
  `SupabasePayableEntryRepository`/`SupabaseInvoiceReadAdapter`.
- **Domínio**: a entity `PayableEntry` não ganhou um campo `organizationId` —
  a organização é uma preocupação de acesso/query, não um invariante de
  negócio da entidade.

O `InvoiceReadPort` deste módulo é independente do `PayableEntryWritePort`
que o módulo `invoices` declara para o sentido inverso (ver D3 abaixo) — cada
um tem o seu próprio adapter Supabase e a sua própria conversão B2, feita no
ticket do respectivo módulo.

## Ports

### Entrada (use cases)

- `CreatePayableEntryPort` — cria entrada manual (sem fatura). `CreatePayableEntryCommand` inclui `organizationId`.
- `UpdatePayableEntryPort` — edita campos de uma entrada não cancelada. `UpdatePayableEntryCommand` inclui `organizationId`.
- `MarkPayableAsPaidPort` — marca como paga, regista `paidAt`. `MarkPayableAsPaidCommand` inclui `organizationId`.
- `CancelPayableEntryPort` — cancela uma entrada não paga. `CancelPayableEntryCommand = { organizationId, id }`.
- `ListPayableEntriesPort` — lista com filtros: período, CC, fornecedor, status. `ListPayableEntriesFilter` inclui `organizationId` (obrigatório) mais os filtros opcionais.
- `GetPayableEntryPort` — detalhe de uma entrada. `GetPayableEntryQuery = { organizationId, id }`.
- `DeletePayableEntryPort` — elimina (apenas se `cancelled`). `DeletePayableEntryCommand = { organizationId, id }`.
- `GetPayableSummaryPort` — KPIs agregados. Recebe `ListPayableEntriesFilter` (mesmo tipo do list, incluindo `organizationId`).
- `GetPayableCalendarPort` — entradas agrupadas por dia (para vista calendário). `GetPayableCalendarCommand` inclui `organizationId`.

### Saída (dependências do domínio)

- `PayableEntryRepositoryPort` — `save(organizationId, entry)`, `findById(organizationId, id)`,
  `findAll(organizationId, filter?)`, `update(organizationId, entry)`, `delete(organizationId, id)`.
- `InvoiceReadPort` — `findById(organizationId, id)`, `markPaid(organizationId, invoiceId, paidAt)`.
  Leitura de dados mínimos de uma fatura (id, fornecedor, valor, vencimento) e marcação de
  pagamento. Declarado aqui; o adapter concreto acede directamente à tabela `invoices`.

Em ambos, `organizationId` é sempre o primeiro parâmetro do método (D2).

## Adapters

### Entrada

- `createPayableEntryRouter` → expõe todos os use cases via REST em `/api/payable-entries`.

### Saída

- `SupabasePayableEntryRepository` → tabela `payable_entries`, via `ScopedQueryFactory` (D2) — não guarda um `SupabaseClient`.
- `SupabaseInvoiceReadAdapter` → tabela `invoices` (sem importar o módulo `invoices`), via `ScopedQueryFactory`.

## Rotas

```
GET    /api/payable-entries                    lista com filtros (supplierId, costCenterId, status, from, to)
POST   /api/payable-entries                    criar entrada manual
GET    /api/payable-entries/summary            KPIs
GET    /api/payable-entries/calendar?from=&to= agrupado por dia
GET    /api/payable-entries/:id                detalhe
PATCH  /api/payable-entries/:id                editar
PATCH  /api/payable-entries/:id/paid           marcar pago
PATCH  /api/payable-entries/:id/cancel         cancelar
DELETE /api/payable-entries/:id                eliminar (só se cancelled)
```

Todas as rotas requerem role `manager` (via `requireMinRole` no server.ts).

## Decisões de design

**D1 — `InvoiceReadPort` declarado neste módulo, não importado de `invoices`.**
Os módulos hexagonais são independentes entre si. Importar `SupabaseInvoiceRepository` do módulo `invoices` criaria acoplamento entre módulos. Em vez disso, este módulo declara a interface `InvoiceReadPort` com apenas os campos que precisa, e o adapter concreto (`SupabaseInvoiceReadAdapter`) acede directamente à tabela SQL. Quando `financial-reports` precisar do mesmo padrão, repete a mesma abordagem.

**D2 — Deleção apenas para entradas `cancelled`.**
Uma entrada paga não deve ser eliminada para preservar o histórico financeiro. O utilizador deve cancelar primeiro, e só então pode apagar.

**D3 — Sincronização invoice ↔ payable por ports cruzados.**
O módulo `invoices` declara `PayableEntryWritePort` para criar/cancelar/marcar-pago entradas a partir de eventos de fatura (criação com `dueDate`, `setStatus(cancelled)`, `markPaid`). O módulo `payable-entries` declara `InvoiceReadPort` para sincronizar a fatura quando uma conta a pagar é marcada como paga. Os dois módulos nunca se importam directamente — comunicam apenas por interface.

**D4 — Recorrência é apenas metadado nesta fase.**
O campo `recurrence` regista a intenção (mensal, trimestral, anual), mas a criação automática de entradas futuras está fora do âmbito. Fica preparado para quando for implementado.

## Como testar

- Domínio/use cases: `npx jest --testPathPattern="payable-entries"` (rápido, sem banco).
- Adapters Supabase: requerem instância real — testar manualmente ou com jest integração separado.

## Pontos de atenção / dívidas conhecidas

- A criação automática de entradas recorrentes não está implementada.
- Não há validação do formato das datas no use case (confia que o controller/Zod valida na borda).
