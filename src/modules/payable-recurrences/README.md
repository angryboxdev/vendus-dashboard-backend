# Módulo: payable-recurrences

> Status: ativo
> Última atualização: 2026-08-21

---

## O que é e para que serve (perspectiva de negócio)

A Angrybox tem despesas que se repetem todos os meses — aluguel da loja, energia,
internet, contabilidade, salários. Quando estas obrigações só aparecem no sistema
depois de uma fatura importada ou de um movimento bancário conciliado, o gestor
perde previsibilidade e o sistema fica reativo.

Este módulo resolve esse problema criando **recorrências**: regras permanentes que
descrevem um compromisso financeiro e geram automaticamente uma **ocorrência mensal**
por cada período. A ocorrência percorre um ciclo de vida claro até ser paga.

**O problema que resolve:**
Sem recorrências, o gestor não sabe o que vai pagar no próximo mês antes de receber
as faturas. O fluxo de caixa previsto fica vazio ou manual. Uma conta de energia pode
ser esquecida até chegar a carta de aviso.

**O fluxo do ponto de vista do negócio:**

*Caminho A — contrato fixo (valor conhecido, sem fatura obrigatória):*
```
Gestor                                  Sistema
──────────────────────────────          ────────────────────────────────────────
1. Cria recorrência
   (ex: Contabilidade, fixo,
    dia 10, 250 EUR)
                                    →   2. Regista contrato. Status: activa.

3. Gera ocorrência para Set 2026
                                    →   4. Cria ocorrência 2026-09.
                                           Status: previsão.
                                           Due: 10/09/2026 (estimado: 250 EUR)

5. Paga e regista no sistema
                                    →   6. Ocorrência: paga. Ciclo completo.
```

*Caminho B — fatura variável (valor confirmado pela fatura):*
```
Gestor                                  Sistema
──────────────────────────────          ────────────────────────────────────────
1. Cria recorrência
   (ex: Energia - Gold Energy,
    variável, dia 20, 261,75 EUR est.)
                                    →   2. Regista contrato. Status: activa.

3. Gera ocorrência para Set 2026
                                    →   4. Cria ocorrência 2026-09.
                                           Status: a aguardar fatura.
                                           Due: 20/09/2026 (estimado: 261,75 EUR)

5. Recebe fatura PDF, importa e
   vincula à ocorrência
                                    →   6. Ocorrência: fatura vinculada.
                                           Valor real: 310,50 EUR.

7. Paga e regista no sistema
                                    →   8. Ocorrência: paga. Ciclo completo.
```

*Caminho C — contrato fixo justificado pelo extrato bancário (sem fatura obrigatória):*
```
Gestor                                  Sistema
──────────────────────────────          ────────────────────────────────────────
1. Cria recorrência
   (ex: Renda, fixo,
    dia 5, 1.000 EUR)
                                    →   2. Regista contrato. Status: activa.

3. Gera ocorrência para Ago 2026
                                    →   4. Cria ocorrência 2026-08.
                                           Status: previsão.
                                           Due: 05/08/2026 (estimado: 1.000 EUR)

5. Importa extrato de Agosto.
   Vê débito de 1.000 EUR → clica
   em "Justificar despesa" →
   escolhe "Contrato recorrente" →
   selecciona a recorrência "Renda"
   e a ocorrência de Agosto
                                    →   6. Movimento: Justificado.
                                           Ocorrência 2026-08 recebe badge "Banco"
                                           na lista de recorrências, confirmando
                                           que o pagamento bancário foi identificado.
```

**Conceitos-chave para o negócio:**

- **Recorrência / Contrato** — regra permanente que define o compromisso: quem paga,
  a quem, quando, quanto (estimado) e como. Pode estar activa, pausada ou encerrada.
- **Ocorrência mensal** — instância da recorrência num mês específico. Tem o seu
  próprio valor real (quando a fatura chega), data de vencimento e estado no ciclo.
- **Fatura / documento real** — documento recebido que confirma valor e datas.
  Vinculado à ocorrência, nunca ao contrato.
- **Conta a pagar** — obrigação financeira em `payable-entries` que pode ser criada automaticamente na geração (contratos fixos com `autoCreatePayable=true`) ou gerida independentemente em `financial-obligations`. O pagamento pode também ser registado directamente na ocorrência sem passar por uma conta a pagar explícita.
- **Movimento bancário vinculado** — quando um débito do extrato bancário é justificado como "Contrato recorrente", fica ligado à ocorrência correspondente. A partir desse momento, a ocorrência exibe um badge "Banco" na lista (com o valor e a data do débito), indicando que o pagamento já está identificado no extrato — mesmo que a ocorrência não esteja marcada como paga formalmente.
- **Paga** — significa que o pagamento foi registado no sistema (estado terminal da ocorrência).

---

## Propósito técnico

Gere recorrências financeiras (contratos/compromissos periódicos) e as suas ocorrências
mensais (com suporte a frequências mensal, trimestral e anual). Alimenta o fluxo de caixa
previsto com valores estimados e substitui esses valores pelos reais quando uma fatura
é vinculada. Sincroniza automaticamente o estado da ocorrência quando a conta a pagar
correspondente é marcada como paga.

**Não é responsabilidade deste módulo:** criar ou gerir faturas de fornecedores
(`invoices`), gerir contas a pagar directamente (`payable-entries`), conciliar
movimentos bancários (`bank-statements`). Comunica com esses módulos apenas por ports
cross-módulo, nunca importando o seu código.

---

## Conceitos do domínio

### `Recurrence`

Entidade principal. Representa o contrato/compromisso recorrente. Invariantes:

- `estimatedAmountCents` > 0.
- `dayOfMonth` entre 1 e 31.
- `endDate` ≥ `startDate` quando definido.
- `variable_invoice` e `fiscal` forçam `requireInvoice = true` (não editável).
- `autoCreatePayable` é sempre `false` quando `requireInvoice = true`.
- Só transita `active → paused`, `paused → active`, `active | paused → closed`.
- `closed` não pode ser editada, reaberta, nem ter documentos anexados.
- Edição afeta apenas campos futuros — ocorrências já existentes não são retroativamente
  alteradas (invariante de negócio; aplicado pelo use case de geração).
- `documentUrl` — URL do contrato/documento base, armazenado no bucket `recurrence-documents`.

**`RecurrenceType`:** `fixed_contract | variable_invoice | recurring_service | payroll | bank_auto | fiscal`

**`RecurrenceStatus`:** `active | paused | closed`

**`RecurrenceFrequency`:** `monthly | quarterly | annual`

**`PaymentMethod`:** `bank_transfer | direct_debit | mb | card | manual`

### `RecurrenceOccurrence`

Instância mensal (ou trimestral/anual) de uma recorrência. Identificada por
`(recurrenceId, period)` — par único na base de dados (UNIQUE constraint).

- `period` — string `YYYY-MM` (ex: `"2026-09"`).
- `estimatedAmountCents` — copiado da recorrência no momento da geração.
- `realAmountCents` — definido quando a fatura é vinculada.
- `effectiveAmountCents` — `real` quando disponível, `estimado` caso contrário.
  Usado para alimentar previsão de caixa.
- `documentUrl` — URL do documento da ocorrência (ex: PDF da fatura mensal).
- Não pode ter duas contas a pagar (`OccurrencePayableAlreadyCreatedError`).
- `paid` não pode ser cancelada.

**`OccurrenceStatus`:** `forecast | awaiting_invoice | invoice_linked | paid | cancelled`

Transições válidas: `forecast → paid` (pagamento directo), `forecast → awaiting_invoice` (quando `requireInvoice=true`), `awaiting_invoice → invoice_linked` (ao vincular fatura), `invoice_linked → paid`, qualquer estado não-pago → `cancelled`.

### `OccurrenceGeneratorService`

Serviço de domínio puro. Dada uma recorrência e um mês `(year, month)`, calcula:
- Se a recorrência está em scope (ativa, dentro de `startDate`/`endDate`).
- Se a frequência da recorrência corresponde ao mês pedido (monthly sempre, quarterly
  a cada 3 meses desde `startDate`, annual a cada 12 meses desde `startDate`).
- A `dueDate` do mês — `dayOfMonth` capped ao último dia do mês (ex: dia 31 em Fevereiro → dia 28).
- O status inicial da ocorrência (`forecast` ou `awaiting_invoice` conforme `requireInvoice`).

Retorna `null` se a recorrência não está em scope ou se a frequência não corresponde
ao mês pedido.

---

## Ports

### Entrada (use cases)

**Recorrências:**
- `CreateRecurrencePort` — cria nova recorrência.
- `UpdateRecurrencePort` — edita campos (não altera ocorrências existentes).
- `PauseRecurrencePort` — pausa recorrência activa.
- `ResumeRecurrencePort` — retoma recorrência pausada.
- `CloseRecurrencePort` — encerra recorrência definitivamente.
- `ListRecurrencesPort` — lista com filtros opcionais (status, type, supplierId).
- `GetRecurrencePort` — detalhe de uma recorrência.

**Ocorrências:**
- `GenerateOccurrencePort` — gera ocorrência para um mês específico. Se `autoCreatePayable=true`, cria conta a pagar imediatamente.
- `ListOccurrencesPort` — lista com filtros (recurrenceId, period, status). Cada DTO inclui `linkedBankMovement` (ou `null`) carregado em batch via `BankMovementLinkReadPort`.
- `GetOccurrencePort` — detalhe de uma ocorrência. Inclui `linkedBankMovement` (ou `null`) via `BankMovementLinkReadPort`.
- `LinkInvoiceToOccurrencePort` — vincula fatura à ocorrência e regista valor real.
- `MarkOccurrenceAsPaidPort` — marca ocorrência como paga (directamente ou após fatura vinculada).
- `CancelOccurrencePort` — cancela ocorrência (não permite cancelar `paid`).
- `GenerateBatchOccurrencesPort` — gera ocorrências para todas as recorrências activas num mês; silencia duplicados (`skippedAlreadyExists`) e fora de scope (`skippedOutOfScope`).
- `GetRecurrenceSummaryPort` — retorna contagem de ocorrências por estado relevante (ex: `awaitingInvoiceCount`).
- `GetLinkedInvoiceIdsPort` — retorna todos os invoice IDs já vinculados a ocorrências (usado para filtrar faturas disponíveis no UI).

**Documentos (sem interface de port formal — use cases concretos injetados directamente):**
- `UploadRecurrenceDocumentUseCase` — faz upload para `recurrence-documents` e actualiza `documentUrl` da recorrência.
- `DeleteRecurrenceDocumentUseCase` — remove do storage e limpa `documentUrl`.
- `UploadOccurrenceDocumentUseCase` — faz upload para `recurrence-documents` e actualiza `documentUrl` da ocorrência.
- `DeleteOccurrenceDocumentUseCase` — remove do storage e limpa `documentUrl`.

### Saída (dependências do domínio)

- `RecurrenceRepositoryPort` — persistência de recorrências.
- `OccurrenceRepositoryPort` — persistência de ocorrências; inclui `findByRecurrenceAndPeriod` para o check de duplicados.
- `PayableEntryWritePort` — cross-módulo: criar conta a pagar em `payable_entries`.
- `InvoiceReadPort` — cross-módulo: ler dados mínimos de uma fatura para vincular.
- `DocumentStoragePort` — armazenamento de ficheiros (contrato base, faturas mensais).
- `BankMovementLinkReadPort` — cross-módulo: dado um conjunto de `occurrenceIds`, devolve um `Map<occurrenceId, LinkedBankMovement>` com data, montante e descrição do movimento bancário que justificou cada ocorrência. Usado por `ListOccurrencesUseCase` e `GetOccurrenceUseCase` para enriquecer o DTO com `linkedBankMovement`. O adapter concreto lê directamente `bank_movements` sem importar código de `bank-statements`.

---

## Adapters

### Entrada

- `createRecurrenceRouter` → expõe todos os use cases via REST em `/api/payable-recurrences`.

### Saída

- `SupabaseRecurrenceRepository` → implementa `RecurrenceRepositoryPort` na tabela `recurring_contracts`.
- `SupabaseOccurrenceRepository` → implementa `OccurrenceRepositoryPort` na tabela `recurring_occurrences`.
- `SupabasePayableEntryWriteAdapter` → cross-módulo, acede directamente à tabela `payable_entries`.
- `SupabaseInvoiceReadAdapter` → cross-módulo, acede directamente à tabela `invoices`.
- `SupabaseRecurrenceDocumentStorageAdapter` → implementa `DocumentStoragePort` no bucket Supabase Storage `recurrence-documents`.
- `SupabaseBankMovementLinkReadAdapter` → cross-módulo; lê `bank_movements WHERE matched_entity_type = 'recurrence_occurrence' AND matched_entity_id IN (...)` directamente, sem importar código de `bank-statements`. Implementa `BankMovementLinkReadPort`.

---

## Rotas

```
GET    /api/payable-recurrences                                          lista (filtros: status, type, supplierId)
POST   /api/payable-recurrences                                          criar recorrência
GET    /api/payable-recurrences/summary                                  resumo (awaitingInvoiceCount)
POST   /api/payable-recurrences/batch/generate                           gerar para todas as ativas (body: {year, month})
GET    /api/payable-recurrences/occurrences/linked-invoice-ids           lista invoice IDs já vinculados
GET    /api/payable-recurrences/occurrences/by-invoice/:invoiceId        ocorrência + recurrenceName por fatura
GET    /api/payable-recurrences/occurrences/:occId                       detalhe ocorrência
PATCH  /api/payable-recurrences/occurrences/:occId/pay                   marcar como paga (body: {paidAt?, paymentMethod?, ...})
PATCH  /api/payable-recurrences/occurrences/:occId/link-invoice          vincular fatura (body: {invoiceId})
DELETE /api/payable-recurrences/occurrences/:occId                       cancelar ocorrência
POST   /api/payable-recurrences/occurrences/:occId/document              upload documento ocorrência (multipart, campo "file")
DELETE /api/payable-recurrences/occurrences/:occId/document              remover documento ocorrência
GET    /api/payable-recurrences/:id                                      detalhe recorrência
PATCH  /api/payable-recurrences/:id                                      editar recorrência
PATCH  /api/payable-recurrences/:id/pause                                pausar
PATCH  /api/payable-recurrences/:id/resume                               retomar
PATCH  /api/payable-recurrences/:id/close                                fechar
POST   /api/payable-recurrences/:id/document                             upload documento base (multipart, campo "file")
DELETE /api/payable-recurrences/:id/document                             remover documento base
GET    /api/payable-recurrences/:id/occurrences                          lista ocorrências (filtros: period, status)
POST   /api/payable-recurrences/:id/occurrences/generate                 gerar para mês (body: {year, month})
```

Todas as rotas requerem role `manager` (via `requireMinRole` no server.ts).

**Ordem de registo importante:** rotas com segmentos fixos (`/summary`, `/batch/generate`,
`/occurrences/linked-invoice-ids`, `/occurrences/by-invoice/:invoiceId`, `/occurrences/:occId`)
estão registadas antes de `/:id` para evitar que strings fixas sejam interpretadas como IDs.

---

## Sincronização cross-módulo (payable-entries ↔ payable-recurrences)

Quando uma conta a pagar é marcada como paga em `payable-entries`
(`MarkPayableAsPaidUseCase`), o módulo chama `OccurrenceSyncPort.syncPayableMarkedPaid`
que transita automaticamente a ocorrência para `paid`.

O port `OccurrenceSyncPort` é **declarado em `payable-entries`** e implementado por
`SupabaseOccurrenceSyncAdapter`, que acede directamente à tabela `recurring_occurrences`
sem importar código deste módulo. Este padrão assegura que `payable-entries` não
depende de `payable-recurrences`.

---

## Decisões de design

**D1 — Separação estrita dos quatro conceitos.**
Recorrência ≠ ocorrência ≠ fatura ≠ conta a pagar. O contrato nunca se converte em
fatura. O que se converte/vincula é a ocorrência mensal. Assim o histórico contratual
fica intacto e cada mês tem o seu próprio documento, valor real e conta a pagar.

**D2 — Ports cross-módulo sem import de código externo.**
Seguindo o padrão D1 do módulo `payable-entries`: `PayableEntryWritePort` e
`InvoiceReadPort` são declarados neste módulo. Os adapters concretos acedem
directamente às tabelas SQL sem importar código de outros módulos.

**D3 — Unique constraint `(recurrence_id, period)` na DB.**
A DB garante que nunca existem duas ocorrências para a mesma recorrência no mesmo mês,
mesmo em cenários de concorrência. O use case também verifica antes de gerar
(`OccurrenceAlreadyExistsError`), mas a constraint é a garantia final.

**D4 — `autoCreatePayable` só para `fixed_contract` sem `requireInvoice`.**
Quando activo, `GenerateOccurrenceUseCase` cria a conta a pagar imediatamente após
gerar a ocorrência, e guarda-a em estado `payable_created`. Para recorrências
variáveis (que exigem fatura), este campo é forçado a `false` pelo domínio.

**D5 — `effectiveAmountCents` para previsão de caixa.**
A ocorrência expõe `effectiveAmountCents = realAmountCents ?? estimatedAmountCents`.
O frontend usa este valor para previsão: enquanto não há fatura, usa o estimado;
quando a fatura chega, o valor real substitui automaticamente sem alterar a previsão histórica.

**D6 — `toLocalDateString` em vez de `toISOString().slice(0,10)`.**
Datas geradas por `new Date(year, month-1, day)` estão em hora local. Converter com
`toISOString()` pode recuar um dia em fusos UTC+. O helper `toLocalDateString` usa
`getFullYear/getMonth/getDate` para serializar sem desfasamento.

**D7 — Frequências `quarterly` e `annual` calculadas por `monthsSinceStart`.**
`isInFrequency()` computa `monthsSinceStart = (year - startYear) * 12 + (month-1) - startMonth`
e aplica `% 3 === 0` (quarterly) ou `% 12 === 0` (annual). `monthly` retorna sempre
`true`. Retorna `null` quando o mês não corresponde à frequência — o use case de
geração individual lança erro; o batch silencia e conta em `skippedOutOfScope`.

**D8 — Sincronização `paid` é unidireccional e assíncrona-por-chamada.**
O port `OccurrenceSyncPort` em `payable-entries` faz UPDATE na tabela `recurring_occurrences`
para `status = 'paid'`. Se não existir ocorrência ligada, o UPDATE não afeta nenhuma linha — sem erro.
O estado `reconciled` foi removido (migration 080): `paid` é o estado terminal da ocorrência.

**D9 — Um documento por nível (recorrência e ocorrência).**
Cada recorrência tem um `documentUrl` (contrato base / documento de referência) e
cada ocorrência tem o seu `documentUrl` (fatura mensal / comprovativo). Fazer upload
quando já existe um documento substitui o anterior (deleta do storage primeiro).
O bucket Supabase é `recurrence-documents`, partilhado entre os dois níveis.

**D10 — `linkedBankMovement` enriquecido via cross-module read em batch.**
`ListOccurrencesUseCase` e `GetOccurrenceUseCase` injectam `BankMovementLinkReadPort`
para enriquecer cada `OccurrenceDTO` com o movimento bancário que o justificou (se
existir). O port recebe todos os IDs de ocorrências de uma vez e devolve um `Map`
— sem N+1 queries. O OccurrenceDTO inclui `linkedBankMovement: { id, bookingDate, amountCents, description } | null`.
Esta informação é exibida no frontend como coluna "Banco" na lista de ocorrências.

---

## Como testar

- Domínio/use cases: `npx jest --testPathPattern="payable-recurrences" --no-coverage` (rápido, sem banco).
- Todos os módulos financeiros: `npx jest --testPathPattern="payable-recurrences|payable-entries" --no-coverage`.
- Adapters Supabase: requerem instância real — testar manualmente contra ambiente de desenvolvimento.

**Cobertura atual:** 16 suites, 155+ testes, 0 falhos. Todos os 20 use cases cobertos. Inclui testes de enriquecimento `linkedBankMovement` via `FakeBankMovementLinkReadAdapter`.

---

## Pontos de atenção / dívidas conhecidas

- **Vinculação inversa de fatura:** quando uma fatura é importada por IA/email, o
  sistema não sugere automaticamente a recorrência correspondente. Requereria lógica
  no módulo de importação de faturas (fora do scope deste módulo).
- **Bucket único para dois níveis:** `recurrence-documents` armazena tanto documentos
  base de recorrências como documentos de ocorrências. Se no futuro for necessário
  controlo de acesso diferenciado, poderá ser necessário separar em dois buckets.
