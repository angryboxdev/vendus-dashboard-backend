# Migração — Fornecedores, Financeiro e Stock v1.2 · Fase 1

Guia para aplicar a F1 em produção. Nada aqui altera documentos antigos:
sem efeitos retroativos, sem fusões e sem apagar nada automaticamente.

## 1. Migrações SQL (por esta ordem)

| Migração | O que faz | Rollback |
| --- | --- | --- |
| `20261030110000_fiscal_document_identities` | Identidade fiscal partilhada Financeiro/Stock (chave única) + auditoria | `docs/migrations/rollback/20261030110000_…` |
| `20261030120000_supplier_invoice_imports_supplier_nif` | NIF do fornecedor na importação do Stock | idem |
| `20261030130000_payable_entries_one_active_per_invoice` | Índice único parcial: uma obrigação ativa por fatura. **Só é criado se não houver duplicados históricos** (senão emite um `NOTICE` e não falha) | idem |
| `20261030140000_invoices_file_sha256` | Hash do ficheiro importado (reimportação devolve o mesmo documento) | idem |
| `20261030150000_invoice_amounts_discounts` | Descontos, quadro de IVA, diferença para a fatura, ajuste de arredondamento com motivo | idem |
| `20261030160000_invoice_version_audit` | `invoices.version` + `invoice_audit_logs` | idem |

Todas as migrações são idempotentes (`if not exists` / `drop … if exists`),
foram validadas em PGlite (aplicar duas vezes, rejeição de valores inválidos,
rollback limpo) e as colunas novas são opcionais: faturas antigas ficam com
`null` (= "não registado") e versão 1.

## 2. Simulação do histórico (identidade fiscal)

Depois do deploy, **primeiro em simulação** (por omissão `dryRun: true`),
com uma sessão com permissão `finance.invoices` / `MANAGE`:

```http
POST /api/fiscal-documents/backfill
Content-Type: application/json

{ "dryRun": true }
```

Relatório devolvido:

- `scanned` — documentos analisados (faturas não rascunho/canceladas e importações confirmadas do Stock);
- `registered` — identidades que seriam registadas;
- `alreadyRegistered` — já registadas (repetir é seguro);
- `incomplete` — documentos sem NIF válido ou sem número (completar à mão; ficam fora da chave);
- `duplicates` — a mesma identidade em mais de um documento. **Rever à mão**: nada é fundido nem apagado.

Só depois de rever o relatório:

```json
{ "dryRun": false }
```

O mais antigo de cada chave fica com a identidade; fatura e importação do
Stock do mesmo documento ficam ligadas à mesma identidade.

## 3. Obrigações duplicadas (contas a pagar)

```http
GET /api/invoices/integrity/payable-duplicates
```

Lista faturas com mais de uma conta a pagar ativa (`invoiceId`, `payableIds`,
`statuses`). Corrigir manualmente (cancelar a duplicada que não tem
pagamento). Depois, voltar a correr a migração
`20261030130000_payable_entries_one_active_per_invoice` — é idempotente e cria
o índice único quando já não houver duplicados. Confirmar no log que não
aparece o `NOTICE` de duplicados.

## 4. Comportamentos novos a validar

- Reimportar o mesmo ficheiro → devolve o documento existente (`reused: "same_file"`), sem nova chamada à IA.
- Importar o mesmo documento já lançado no Financeiro → devolve o original (`reused: "same_fiscal_identity"`).
- Confirmar/criar com valores que não batem ao cêntimo → 422 `amounts_not_reconciled` (o rascunho fica intacto).
- Duas sessões a editar/confirmar a mesma fatura → a segunda recebe 409 `version_conflict`.
- Alterar o total de uma fatura cuja conta a pagar já foi paga → 409 `payable_settled`.
- Confirmar no Stock um documento que já existe no Financeiro → 409 (sem duplicar quantidades).

## 5. Reverter

Aplicar os rollbacks pela ordem inversa (160000 → 110000). Perde-se a
auditoria, as versões, os descontos registados e as identidades fiscais; os
documentos em si não são tocados.
