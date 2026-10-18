# Module: fiscal-documents

> Status: active
> Last updated: 2026-10-14

---

## What it is and what it's for (business perspective)

Garante que uma fatura (ou nota de crédito) real tem **uma só identidade**
no Mezza, venha do Financeiro ou do Stock. Impede a mesma fatura de ser
lançada duas vezes ou de entrar duas vezes no stock.

**The problem it solves:**
A mesma fatura podia entrar no Financeiro e no import do Stock (ou ser
reimportada) e gerar contas a pagar ou entradas de stock em duplicado.

**The flow from the business's point of view:**

```
Utilizador                               Sistema
──────────────────────                 ──────────────────────
1. Confirma uma fatura             →   2. Já existe? Recusa e indica o original
3. Importa no Stock a mesma        →   4. Recusa (já lançada no Financeiro)
5. Fatura parecida (FT 064311)     →   6. Pede para comparar; não funde
```

## Technical purpose

Identidade fiscal partilhada com chave forte (organização + entidade
compradora + país/NIF do emitente + tipo + série/número) e unicidade
garantida pela base de dados (pedidos simultâneos acabam na mesma
identidade). Migração do histórico com simulação e relatório.

## Domain concepts

- **Chave forte** — `buyerKey` (entidade legal ou `org`), país + NIF
  normalizado (PT só com dígito de controlo válido; estrangeiro com país
  explícito), tipo (`invoice`/`credit_note`), série/número normalizado
  (maiúsculas/espaços; zeros e separadores mantidos; nunca inteiro).
- **Possível duplicado** — mesmo emitente/tipo e mesmos grupos numéricos
  com formatação diferente → comparação manual, nunca fusão.
- **Resolução** — `new`, `existing_finance`, `existing_stock_only`,
  `possible_duplicate`, `incomplete` (NIF/país/número em falta, ou NIF português com dígito de controlo errado → `issuer_tax_id_invalid`, para não pedir um «país» quando o problema é um dígito mal lido → fica em revisão).

## Ports

### Input (use cases)

- `FiscalDocumentsPort.resolve` — só leitura (aviso na importação).
- `claimForInvoice` / `claimForStockImport` — reservar (idempotente, seguro em concorrência); completar o do Stock só por escolha explícita.
- `releaseInvoice` — fatura apagada que nunca chegou ao Stock.
- `backfill` — histórico (simulação por omissão): regista o mais antigo, liga fatura+importação do mesmo documento, relata duplicados e incompletos.

### Output (domain dependencies)

- `FiscalIdentityRepositoryPort` — `fiscal_document_identities` (índice único na chave, na fatura e na importação).
- `FiscalAuditPort` — `fiscal_document_audit_logs` (autor, origem, antes/depois).

## Adapters

### Input

- `POST /api/fiscal-documents/backfill` (`finance.invoices` MANAGE), `dryRun` true por omissão.

### Output

- `SupabaseFiscalIdentityRepository` (violação de unicidade 23505 → devolve a identidade vencedora).

## Design decisions (ADR summary)

- ADR-0039: unicidade numa tabela própria (não nas faturas históricas); histórico por backfill com simulação; o import legado do Stock deixa de substituir importações (não apaga movimentos) e exige identidade completa.

## How to test

- `npx jest --config jest.config.cjs src/modules/fiscal-documents` (repositório falso com as mesmas regras de unicidade).
