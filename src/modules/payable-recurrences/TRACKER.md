# Tracker: Módulo payable-recurrences

> Criado: 2026-08-18
> Última atualização: 2026-08-19
> Status geral: CONCLUIDO — 5 fases originais + 4 itens de backend adicionais implementados

---

## Contexto

O módulo `payable-entries` já existe e gere contas a pagar pontuais. O campo
`recurrence` nele é apenas metadado — não gera ocorrências automáticas (dívida
técnica explícita no README). Este novo módulo `payable-recurrences` resolve
exatamente esse gap: gere compromissos recorrentes, gera ocorrências mensais e
liga-as a faturas e contas a pagar.

Relação entre módulos:
```
payable-recurrences
  ├── Recurrence          (contrato / regra permanente)
  ├── RecurrenceOccurrence (instância mensal)
  │     ├── referencia --> payable_entries.id (quando payable criado)
  │     └── referencia --> invoices.id        (quando fatura vinculada)
  └── cross-module via ports (nunca import direto)
```

---

## Domínio — conceitos chave

| Conceito | Entidade | Descrição |
|---|---|---|
| Recorrência / Contrato | `Recurrence` | Regra permanente — aluguel, energia, etc. |
| Ocorrência mensal | `RecurrenceOccurrence` | Instância de um mês específico |
| Fatura / documento real | via `InvoiceReadPort` | Referência cruzada (módulo invoices) |
| Conta a pagar | via `PayableEntryWritePort` | Referência cruzada (módulo payable-entries) |

### Tipos de recorrência (`RecurrenceType`)
- `fixed_contract` — aluguel, prestação fixa
- `variable_invoice` — energia, água, telecom
- `recurring_service` — contabilidade, software
- `payroll` — salários, encargos
- `bank_auto` — tarifas bancárias, seguros
- `fiscal` — IVA, guias fiscais

### Estados da Recorrência (`RecurrenceStatus`)
- `active` — vigente, gera ocorrências
- `paused` — não gera novas ocorrências, histórico preservado
- `closed` — encerrada, histórico preservado

### Estados da Ocorrência (`OccurrenceStatus`)
- `forecast` — previsão gerada, sem documento real
- `awaiting_invoice` — documento real obrigatório antes de criar conta a pagar
- `invoice_linked` — fatura/documento associado e validado
- `payable_created` — conta a pagar gerada
- `paid` — pagamento registado
- `reconciled` — confirmado contra movimento bancário
- `cancelled` — ocorrência inválida, histórico preservado

---

## Fases de implementação

### FASE 1 — Domain core [CONCLUIDA 2026-08-19]
**Ficheiros criados:**
- [x] `domain/entities/recurrence.ts` — entidade + invariantes
- [x] `domain/entities/recurrence-occurrence.ts` — entidade + invariantes
- [x] `domain/errors.ts` — erros de domínio
- [x] `domain/services/occurrence-generator.service.ts` — lógica de geração de ocorrências

**Testes: 62 passed, 0 failed**
- [x] `__tests__/domain/recurrence.test.ts`
- [x] `__tests__/domain/recurrence-occurrence.test.ts`
- [x] `__tests__/domain/occurrence-generator.service.test.ts`

---

### FASE 2 — Ports & Use Cases [CONCLUIDA 2026-08-19]
**Ports de entrada (`domain/ports/in/`):**
- [x] `recurrence.ports.ts` — CreateRecurrence, UpdateRecurrence, PauseRecurrence, ResumeRecurrence, CloseRecurrence, ListRecurrences, GetRecurrence
- [x] `occurrence.ports.ts` — GenerateOccurrence, ListOccurrences, GetOccurrence, LinkInvoiceToOccurrence, CreatePayableFromOccurrence, CancelOccurrence

**Ports de saída (`domain/ports/out/`):**
- [x] `recurrence-repository.port.ts`
- [x] `occurrence-repository.port.ts`
- [x] `payable-entry-write.port.ts` — cross-module: criar conta a pagar
- [x] `invoice-read.port.ts` — cross-module: ler dados da fatura para vincular

**Use cases (`application/use-cases/`):**
- [x] `shared.ts` — toRecurrenceDTO, toOccurrenceDTO (com fix de timezone: toLocalDateString)
- [x] `create-recurrence.use-case.ts`
- [x] `update-recurrence.use-case.ts`
- [x] `pause-recurrence.use-case.ts`
- [x] `resume-recurrence.use-case.ts`
- [x] `close-recurrence.use-case.ts`
- [x] `list-recurrences.use-case.ts`
- [x] `get-recurrence.use-case.ts`
- [x] `generate-occurrence.use-case.ts` — inclui autoCreatePayable para fixed_contract
- [x] `list-occurrences.use-case.ts`
- [x] `get-occurrence.use-case.ts`
- [x] `link-invoice-to-occurrence.use-case.ts`
- [x] `create-payable-from-occurrence.use-case.ts`
- [x] `cancel-occurrence.use-case.ts`

**Testes: 86 passed, 0 failed**
- [x] `__tests__/fakes/` — FakeRecurrenceRepository, FakeOccurrenceRepository, FakePayableEntryWrite, FakeInvoiceRead
- [x] `__tests__/use-cases/create-recurrence.test.ts`
- [x] `__tests__/use-cases/generate-occurrence.test.ts`
- [x] `__tests__/use-cases/link-invoice-to-occurrence.test.ts`
- [x] `__tests__/use-cases/create-payable-from-occurrence.test.ts`
- [x] `__tests__/use-cases/pause-close-recurrence.test.ts`

---

### FASE 3 — DB + Adapters out [CONCLUIDA 2026-08-19]
**Migração:**
- [x] `supabase/migrations/072_payable_recurrences.sql`
  - Tabela `recurring_contracts` (CHECK constraints em type, frequency, payment_method, status; UNIQUE(recurrence_id, period) em occurrences)
  - Tabela `recurring_occurrences`
  - Índices em status, supplier_id, type, recurrence_id, period, due_date

**Adapters Supabase (`adapters/out/`):**
- [x] `supabase-recurrence.repository.ts`
- [x] `supabase-occurrence.repository.ts`
- [x] `supabase-payable-entry-write.adapter.ts` — cross-módulo, insere na tabela payable_entries com recurrence="none"
- [x] `supabase-invoice-read.adapter.ts` — cross-módulo, lê apenas os campos necessários de invoices

---

### FASE 4 — Adapter in + Module [CONCLUIDA 2026-08-19]
**Controller HTTP (`adapters/in/`):**
- [x] `recurrence.controller.ts` — 13 rotas, handleError mapeia 9 tipos de erro de domínio

**Rotas implementadas:**
```
GET    /api/payable-recurrences                              lista recorrências (filtros: status, type, supplierId)
POST   /api/payable-recurrences                              criar recorrência
GET    /api/payable-recurrences/occurrences/:occId           detalhe ocorrência  ← antes de /:id
POST   /api/payable-recurrences/occurrences/:occId/create-payable  criar conta a pagar
PATCH  /api/payable-recurrences/occurrences/:occId/link-invoice    vincular fatura
PATCH  /api/payable-recurrences/occurrences/:occId/cancel          cancelar ocorrência
GET    /api/payable-recurrences/:id                          detalhe recorrência
PATCH  /api/payable-recurrences/:id                          editar
PATCH  /api/payable-recurrences/:id/pause                    pausar
PATCH  /api/payable-recurrences/:id/resume                   retomar
PATCH  /api/payable-recurrences/:id/close                    fechar
GET    /api/payable-recurrences/:id/occurrences              lista ocorrências (filtros: period, status)
POST   /api/payable-recurrences/:id/occurrences/generate     gerar para mês (body: {year, month})
```

**Module:**
- [x] `payable-recurrences.module.ts` — composition root, registado em server.ts

**Notas:**
- Routes de occurrences registadas ANTES de /:id para evitar conflito de params
- exactOptionalPropertyTypes: use spread condicional `...(x !== undefined && { x })` nos use cases
- 3 fixes de exactOptionalPropertyTypes: controller (2×) + create-recurrence + update-recurrence

---

### FASE 5 — Documentação [CONCLUIDA 2026-08-19]
- [x] `README.md` do módulo (template completo CLAUDE.md) — inclui 7 decisões de design e dívidas conhecidas
- [ ] Actualizar memory (`payable-recurrences.md`) — pendente

---

## Regras de negócio críticas (referência rápida)

1. Recorrência != fatura. Contrato != fatura. A ocorrência é que se converte/vincula.
2. `variable_invoice` e `fiscal`: não criar conta a pagar sem fatura vinculada.
3. `fixed_contract`: pode criar conta a pagar automaticamente se `autoCreatePayable=true` e documento base presente.
4. Editar recorrência ativa afeta apenas ocorrências futuras (não `paid` nem `reconciled`).
5. Ocorrências `reconciled` não editáveis sem controlo explícito.
6. Previsão de caixa usa `estimatedAmount`; valor real substitui quando fatura é vinculada.
7. Sem duplicidade: não criar segunda conta a pagar para ocorrência com payable já criado.
8. `paid` e `reconciled` são estados separados.

---

## Dependências e integrações

| Módulo | Relação | Mecanismo |
|---|---|---|
| `payable-entries` | Criar conta a pagar a partir de ocorrência | `PayableEntryWritePort` (declarado aqui, implementado por adapter Supabase direto à tabela) |
| `invoices` | Ler dados da fatura para vincular | `InvoiceReadPort` (declarado aqui, igual padrão D1 do payable-entries) |
| `financial-base` | Fornecedores e centros de custo | Leitura directa à tabela (sem import de módulo) |

---

## Itens de backend adicionais [TODOS CONCLUIDOS 2026-08-19]

### Item 1 — Frequências quarterly/annual [CONCLUIDO]
- `isInFrequency()` adicionado a `occurrence-generator.service.ts`
- Fórmula: `monthsSinceStart % 3 === 0` (quarterly), `% 12 === 0` (annual)
- 12 novos testes no `occurrence-generator.service.test.ts`

### Item 2 — Geração em lote [CONCLUIDO]
- `domain/ports/in/batch.ports.ts` — GenerateBatchCommand, BatchGenerationResult, GenerateBatchOccurrencesPort
- `application/use-cases/generate-batch-occurrences.use-case.ts`
- `__tests__/use-cases/generate-batch-occurrences.test.ts`
- Rota: `POST /api/payable-recurrences/batch/generate`

### Item 3 — RF09: Uploads de documentos [CONCLUIDO]
- `domain/ports/out/document-storage.port.ts`
- `adapters/out/supabase-document-storage.adapter.ts` — bucket: `recurrence-documents`
- Entidades actualizadas: `documentUrl` + `setDocumentUrl()` em Recurrence e RecurrenceOccurrence
- DTOs actualizados com `documentUrl`
- 4 use cases: upload/delete × recorrência/ocorrência
- Migration 073: `ALTER TABLE` adiciona `document_url text` a ambas as tabelas
- Repositórios Supabase actualizados com `document_url`
- 4 novas rotas no controller (multer memoryStorage):
  - `POST /api/payable-recurrences/:id/document`
  - `DELETE /api/payable-recurrences/:id/document`
  - `POST /api/payable-recurrences/occurrences/:occId/document`
  - `DELETE /api/payable-recurrences/occurrences/:occId/document`

### Item 4 — Sincronização automática de estado [CONCLUIDO]
- `payable-entries/domain/ports/out/occurrence-sync.port.ts` — OccurrenceSyncPort
- `payable-entries/adapters/out/supabase-occurrence-sync.adapter.ts` — acede directamente a `recurring_occurrences`
- `MarkPayableAsPaidUseCase` actualizado — 3º param opcional `OccurrenceSyncPort | null`
- `payable-entries.module.ts` actualizado — adapter plugado
- 2 novos testes em `mark-payable-as-paid.test.ts` + `fake-occurrence-sync.ts`

**Resultado final: 158 testes, 0 falhos**

---

## Log de sessões

| Data | Sessão | O que foi feito |
|---|---|---|
| 2026-08-18 | #1 | Análise do codebase, planeamento completo, criação deste tracker |
| 2026-08-19 | #2 | Fase 1 completa: domain/entities/recurrence.ts, recurrence-occurrence.ts, errors.ts, occurrence-generator.service.ts — 62 testes verdes |
| 2026-08-19 | #2 | Fase 2 completa: 4 output ports, 2 input ports (DTOs), 13 use cases, 4 fakes, 5 ficheiros de teste — 86 testes verdes; fix de timezone em toLocalDateString |
| 2026-08-19 | #3 | Fase 3 completa: migration 072_payable_recurrences.sql, 4 adapters Supabase — 86 testes verdes |
| 2026-08-19 | #4 | Fase 4 completa: recurrence.controller.ts (13 rotas), payable-recurrences.module.ts, registado em server.ts; 3 fixes de exactOptionalPropertyTypes — TSC limpo, 86 testes verdes |
| 2026-08-19 | #5 | Fase 5 completa: README.md com template CLAUDE.md, fluxo de negócio, 7 decisões de design, dívidas conhecidas |
| 2026-08-19 | #6 | Itens adicionais: quarterly/annual, batch, RF09 docs, auto-sync — 158 testes verdes |
