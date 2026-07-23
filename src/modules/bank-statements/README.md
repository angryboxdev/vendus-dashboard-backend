# Módulo: bank-statements

> Status: ativo
> Última atualização: 2026-07-23

---

## O que é e para que serve (perspectiva de negócio)

O módulo de Conciliação Bancária permite ao gestor financeiro importar extratos bancários e verificar se cada movimento está explicado — seja por uma fatura do sistema, um comprovativo avulso, uma taxa bancária automática, uma transferência interna ou outra justificativa válida. No final, o saldo calculado pelo sistema deve bater com o saldo do extrato bancário.

**O problema que resolve:**
Sem este módulo, o gestor não tem visibilidade sobre se o saldo do banco coincide com o registado no sistema, nem sabe quais saídas ficaram sem justificativa, expostas a risco ou simplesmente esquecidas.

**O fluxo do ponto de vista do negócio:**

```
Gestor Financeiro
────────────────────────────────────────────────────────────
1. Importa extrato (CSV ou XLSX) do banco
2. Sistema detecta banco, conta, período, saldos e movimentos
3. Aplica regras automáticas (ex: "COM.MAN.CONTA" → taxa bancária)
4. Sistema sugere conciliações com faturas e contas a pagar existentes
5. Gestor revisa movimento a movimento:
   a. "Conciliar com sistema" — selecciona uma ou mais faturas/contas a pagar
      que juntas justificam o pagamento; o sistema mostra a diferença em tempo real.
      O sistema só apresenta faturas ainda não conciliadas — faturas já associadas
      a outro movimento são automaticamente ocultadas, evitando registar o mesmo
      pagamento duas vezes. Alterar a conciliação do próprio movimento (ex: trocar
      de fatura) é sempre permitido.
   b. "Justificar despesa" — sobe comprovativo, indica fornecedor (opcional),
      centro de custo e IVA; para tipos sem documento (ex: transferência interna)
      preenche apenas as notas
6. Movimentos não justificados ficam destacados como "Saída não justificada"
7. Movimentos com entidades associadas mas com diferença de montante > 1€
   ficam como "Conciliação parcial" — visíveis numa tab dedicada para revisão
8. Quando saldo fecha (diff = 0) e sem pendências de alto risco → fecha conciliação
```

**Conceitos-chave para o negócio:**

- **Extrato bancário** — ficheiro CSV/XLSX exportado do banco com os movimentos de um período.
- **Conciliação** — processo de verificar que cada movimento bancário tem uma explicação válida no sistema.
- **Conciliação multi-entidade** — um único pagamento bancário pode corresponder a várias faturas em simultâneo (ex: pagamento agregado ao mesmo fornecedor). O gestor selecciona as faturas que juntas compõem o total; o sistema valida se os montantes fecham.
- **Conciliação parcial** — movimento já associado a entidades, mas com diferença de montante superior a 1€. Sinaliza que algo ficou por explicar: pode faltar uma fatura, ou o pagamento incluiu uma taxa não registada.
- **Saldo calculado** — saldo que o sistema computa somando/subtraindo os movimentos; deve coincidir com o saldo final do extrato.
- **Saída não justificada** — débito sem fatura, sem regra, sem contrato e sem explicação manual.
- **Regra automática** — padrão de texto na descrição bancária que classifica automaticamente futuros movimentos similares (ex: "COM.MAN.CONTA" → taxa bancária).
- **Sugestão** — correspondência provável que o sistema encontrou entre um movimento e uma fatura/conta a pagar; pendente de confirmação pelo gestor. O sistema aprende com conciliações exactas passadas para melhorar as sugestões futuras.
- **Comprovativo** — ficheiro (PDF ou imagem) que justifica uma despesa sem fatura no sistema (ex: recibo de uma compra pontual, taxa bancária manual).
- **Centro de custo** — classificação interna da despesa (grupo + categoria) para efeitos de DRE e cashflow; obrigatório em todos os tipos de justificação que não sejam transferências internas.
- **IVA** — registado como taxa percentual + indicador de inclusão no valor (incluído/excluído/isento); os relatórios financeiros usam esta informação para calcular o valor líquido da despesa.
- **Exclusividade de conciliação** — cada fatura ou conta a pagar só pode estar associada a um movimento bancário de cada vez. O sistema impede que a mesma fatura apareça em dois movimentos diferentes, garantindo que um pagamento não seja registado em duplicado. Se o gestor tentar conciliar um movimento com uma fatura já tomada, recebe um erro imediato.

---

## Propósito técnico

Importa, persiste e reconcilia movimentos bancários contra entidades do sistema financeiro (faturas, contas a pagar), suportando ligação de um movimento a múltiplas entidades. Também suporta classificação manual enriquecida com centro de custo, fornecedor, IVA e upload de comprovativo. Não é responsabilidade deste módulo: contabilidade fiscal formal, SAF-T, integração bancária automática via API.

## Conceitos do domínio

### Entidades

**BankStatementImport**
Cabeçalho do extrato: banco, conta, período, saldo inicial/final do extrato, saldo calculado pelo sistema, diferença de saldo, progresso da conciliação e status.

Invariante: `close()` rejeita se `balanceDifference !== 0`.

**BankMovement**
Cada linha do extrato. Armazena valor absoluto (cents) + `movementType` (debit/credit) para determinar direção. Status inicial: débitos → `saida_nao_justificada`; créditos → `conciliado_sem_fatura` (auto-resolvidos).

Campos de classificação manual (todos opcionais no domínio):
- `costCenterGroupId` / `costCenterCategoryId` — centro de custo da despesa
- `supplierId` — fornecedor associado (cross-module, sem FK hard no domínio)
- `vatRate` — taxa de IVA em percentagem (ex: 23)
- `vatIncluded` — `true` se o `amount` já inclui IVA; `false` se é valor base; `null` se isento/não aplicável
- `documentUrl` — URL pública do comprovativo no Supabase Storage
- `reconciliationAmountDiff` — diferença em cêntimos entre `amount` e a soma dos `entityLinks` associados. `null` quando não aplicável (conciliação exacta ou movimento por classificar).

Risco inicial para débitos: `< 50€ → low`, `>= 50€ → medium`, `>= 500€ → high`, `>= 5000€ → critical`.

Métodos de domínio relevantes:
- `classify(opts)` — classificação manual com justificação livre.
- `multiReconcile(amountDiff)` — conciliação contra uma ou mais entidades. Se `|amountDiff| ≤ PARTIAL_TOLERANCE_CENTS (100 cts)` → `conciliado_com_fatura`; caso contrário → `conciliado_parcial`. Limpa `matchedEntityId/Type` (a ligação detalha via `BankMovementEntityLink`).
- `markAsSuggestion(...)` — marca como sugestão pendente de confirmação.
- `ignore(reason)` — exclui com motivo obrigatório.

**BankMovementEntityLink**
Registo de ligação individual entre um `BankMovement` e uma entidade do sistema (fatura ou conta a pagar) no contexto de uma conciliação. Cada conciliação pode ter um ou mais links. Guardado na tabela `bank_movement_entity_links`.

Campos:
- `movementId` — FK para `bank_movements`
- `entityType` — `"invoice"` ou `"payable_entry"`
- `entityId` — ID da entidade no sistema
- `amountCents` — montante da entidade no momento da conciliação (snapshot imutável)
- `entityLabel` — label legível, ex: `"Galp Energia — FT 2026/42"`

Ao re-conciliar um movimento, os links anteriores são apagados e substituídos pelos novos.

**BankReconciliationRule**
Regra de matching automático por `descriptionContains` (case-insensitive). Ao fazer match, classifica o movimento com o `justificationType` e `riskLevel` da regra.

### Serviços de domínio

- `ReconciliationCalculatorService` — computa `calculatedClosingBalance`, `reconciliationProgress` e contagem por status a partir de uma lista de movimentos.
- `AutoMatchingService` — aplica regras a movimentos (lógica pura, sem I/O).

### Deduplicação

Hash SHA-256 de `accountNumber + bookingDate + description + amount + movementType` por linha. Movimentos repetidos numa reimportação são ignorados silenciosamente.

### Estados de conciliação

| Estado | Conta como resolvido? | Quando ocorre |
|---|---|---|
| `conciliado_com_fatura` | Sim | Ligado a fatura/payable(s) com diferença ≤ 1€ |
| `conciliado_parcial` | **Não** | Ligado a entidades mas com diferença de montante > 1€ |
| `conciliado_sem_fatura` | Sim | Justificado sem entidade (comprovativo, taxa, etc.) |
| `transferencia_interna` | Sim | Classificado como transferência entre contas |
| `ignorado_com_motivo` | Sim | Excluído da conciliação com razão registada |
| `sugestao` | Não | Correspondência automática pendente de revisão |
| `pendente_de_documento` | Não | Classificado mas sem comprovativo obrigatório |
| `saida_nao_justificada` | Não | Débito sem qualquer justificativa (estado inicial) |
| `divergente` | Não | Valor não bate com a entidade ligada |

`conciliado_parcial` é um estado de atenção: as entidades são conhecidas mas os montantes não fecham. O gestor deve investigar a diferença e re-conciliar ou justificar o remanescente.

### Tipos de justificação

| Tipo | Tab no drawer | Campos obrigatórios |
|---|---|---|
| `fatura` | Conciliar com sistema | entidade ligada (invoice/payable) |
| `recibo_comprovativo` | Justificar despesa | centro de custo |
| `despesa_bancaria_automatica` | Justificar despesa | centro de custo |
| `contrato_recorrencia` | Justificar despesa | fornecedor + centro de custo |
| `transferencia_interna` | Justificar despesa | — |
| `emprestimo_financiamento` | Justificar despesa | centro de custo |
| `sem_justificativa` | Justificar despesa | notas |

---

## Ports

### Entrada (use cases)

- `ImportBankStatementPort` — importa CSV/XLSX; cria o import header e os movimentos em bulk; deduplica por hash.
- `ListBankStatementsPort` — lista imports com filtros opcionais.
- `GetBankStatementPort` — devolve detalhe do import + movimentos (com filtros) + stats ao vivo. Cada movimento inclui `entityLinks[]` carregados em bulk (uma query para todos os movimentos). O campo `balanceAfter` de cada movimento é **calculado dinamicamente** a partir do `openingBalance` do extrato + soma acumulada dos movimentos em ordem cronológica — não lido do valor raw guardado em DB. Isto garante que edições ao saldo inicial se reflectem imediatamente na coluna "Saldo após".
- `ReconcileMovementPort` — vincula um movimento a uma ou mais faturas/contas a pagar. Calcula a diferença de montantes e determina o status (`conciliado_com_fatura` se `|diff| ≤ 1€`, `conciliado_parcial` caso contrário). Guarda learning hint apenas para conciliações de entidade única com match exacto. **Guard de exclusividade:** lança `EntityAlreadyReconciledError` (HTTP 409) se qualquer fatura ou conta a pagar já estiver ligada a um movimento diferente; re-conciliar o mesmo movimento é sempre permitido.
- `ClassifyMovementPort` — classificação manual com suporte a `costCenterGroupId`, `costCenterCategoryId`, `supplierId`, `vatRate`, `vatIncluded` e `documentUrl`.
- `UploadMovementDocumentPort` — faz upload de ficheiro para Supabase Storage e devolve a URL pública; o movimento em si não é alterado (a URL é passada no classify subsequente).
- `ApplyAutoRulesPort` — aplica todas as regras ativas aos movimentos não resolvidos de um import.
- `SuggestMatchesPort` — gera sugestões de correspondência por valor + data + nome do fornecedor.
- `FindMovementCandidatesPort` — devolve candidatos pontuados (fatura + conta a pagar) para um movimento específico; usado pelo drawer de classificação. **Filtro de conciliados:** entidades já ligadas a um movimento diferente são excluídas automaticamente da lista de candidatos; entidades ligadas ao próprio movimento (re-conciliação) são mantidas.
- `CreateReconciliationRulePort` — cria regra automática.
- `ListReconciliationRulesPort` — lista regras.
- `DeleteReconciliationRulePort` — remove regra.
- `CloseStatementPort` — fecha conciliação (valida balance diff = 0 e ausência de movimentos bloqueantes de alto risco).
- `DeleteBankStatementPort` — elimina import e movimentos (CASCADE).
- `UpdateStatementBalancesPort` — corrige saldo inicial/final manualmente.

### Saída (dependências do domínio)

- `BankStatementImportRepositoryPort` — save, findById, findAll, update.
- `BankMovementRepositoryPort` — saveBulk, findByStatementId, findById, update, existsByHash.
- `BankReconciliationRuleRepositoryPort` — save, findAll, findById, update, delete.
- `DocumentStoragePort` — store(buffer, filename, mimeType) → URL pública.
- `BankMovementEntityLinkRepositoryPort` — `saveAll`, `findByMovementIds` (bulk por movimento), `findByEntityIds(entityType, entityIds)` (bulk por entidade — usado para o guard de exclusividade e filtragem de candidatos), `deleteByMovementId` (para re-conciliação).
- `MovementMatchHintPort` — `save(normalizedDesc, supplierId)` para aprendizagem; `findBySupplierId` para sugestões.
- `InvoiceMatchReadPort` *(cross-module)* — `findCandidates` por amount + date range; `findByIds` para lookup bulk na reconciliação.
- `PayableEntryMatchReadPort` *(cross-module)* — `findCandidates` por amount + date range; `findByIds` para lookup bulk na reconciliação.

---

## Adapters

### Entrada

- `BankStatementController` → REST em `/api/bank-statements` (ver rotas abaixo).

### Saída

- `SupabaseBankStatementImportRepository` → tabela `bank_statement_imports`.
- `SupabaseBankMovementRepository` → tabela `bank_movements` (inclui campos de classificação: cost_center_group_id, cost_center_category_id, supplier_id, vat_rate, vat_included, reconciliation_amount_diff).
- `SupabaseBankMovementEntityLinkRepository` → tabela `bank_movement_entity_links`.
- `SupabaseBankReconciliationRuleRepository` → tabela `bank_reconciliation_rules`.
- `SupabaseBankDocumentStorageAdapter` → Supabase Storage, bucket `bank-statement-documents`.
- `SupabaseInvoiceMatchReadAdapter` → cross-module; acede à tabela `invoices` directamente.
- `SupabasePayableEntryMatchReadAdapter` → cross-module; acede à tabela `payable_entries` directamente.
- `CsvStatementParser` → parse de ficheiro CSV (formato Millennium BCP).
- `XlsxStatementParser` → parse de ficheiro XLSX.

### Rotas

```
POST   /api/bank-statements/preview                       pré-visualizar ficheiro sem gravar
POST   /api/bank-statements                               importar extrato (multipart/form-data, field "file")
GET    /api/bank-statements                               listar imports (?accountNumber, ?status, ?from, ?to)
GET    /api/bank-statements/:id                           detalhe + movimentos (?reconciliationStatus, ?movementType, ?riskLevel)
PATCH  /api/bank-statements/:id/balances                  corrigir saldo inicial/final
DELETE /api/bank-statements/:id                           eliminar import e movimentos
POST   /api/bank-statements/:id/apply-rules               aplicar regras automáticas
POST   /api/bank-statements/:id/suggest                   gerar sugestões de matching
POST   /api/bank-statements/:id/close                     fechar conciliação
PATCH  /api/bank-statements/movements/:movId/reconcile    vincular a invoice/payable
PATCH  /api/bank-statements/movements/:movId/classify     classificação manual (incl. costCenter, supplier, VAT, documentUrl)
POST   /api/bank-statements/movements/:movId/document     upload de comprovativo → { documentUrl }
GET    /api/bank-statements/movements/:movId/candidates   candidatos pontuados para um movimento
GET    /api/bank-statements/rules                         listar regras (?activeOnly=true)
POST   /api/bank-statements/rules                         criar regra
DELETE /api/bank-statements/rules/:ruleId                 remover regra
```

---

## Decisões de design (ADR resumido)

**Amounts em cents inteiros** — consistência com o resto do sistema financeiro; evita erros de ponto flutuante.

**`amount` absoluto + `movementType`** — valor sempre não-negativo; a direção (débito/crédito) é separada. Mais legível que valor negativo para débito.

**Deduplicação por hash no import use case** — o hash inclui `accountNumber + bookingDate + description + amount + movementType`. Movimentos duplicados são silenciosamente ignorados (o resultado inclui `skippedDuplicates` para visibilidade). A constraint UNIQUE na tabela actua como segunda linha de defesa.

**Stats persistidas no header** — `calculatedClosingBalance`, `balanceDifference` e `reconciliationProgress` são persistidos no import header (não calculados on-the-fly a cada request), excepto no `GetBankStatementUseCase` que os recalcula ao vivo com os movimentos filtrados. Isto permite listar imports com stats sem carregar todos os movimentos.

**Close em duas camadas** — a entidade `BankStatementImport.close()` valida apenas `balanceDifference === 0` (invariante do domínio). O `CloseStatementUseCase` valida adicionalmente a ausência de movimentos bloqueantes (saida_nao_justificada ou divergente com risk high/critical), que é uma regra de negócio que requer acesso ao repo.

**Upload em dois passos** — o endpoint `POST /movements/:id/document` faz apenas o upload e devolve a URL; o classify subsequente (`PATCH /movements/:id/classify`) persiste a URL junto com os restantes campos. Desta forma, o domínio continua a receber um `ClassifyMovementCommand` coeso sem depender de I/O de storage interno.

**VAT como taxa + flag de inclusão** — `vatRate` (percentagem) + `vatIncluded` (boolean) permitem calcular o valor base a qualquer momento sem armazenar derivados. Os relatórios (DRE) calculam `baseAmount = vatIncluded ? amount / (1 + vatRate/100) : amount`.

**Centro de custo obrigatório no negócio, opcional no domínio** — a entidade `BankMovement` aceita `costCenterGroupId/CategoryId = null` para não bloquear fluxos automáticos (regras, sugestões). A validação de obrigatoriedade vive no controller (request body) e no frontend (formulário).

**Cross-module: fornecedor e centro de custo lidos no UI, não no domínio** — o `ClassifyDrawer` chama directamente as APIs de `financial-base` (listSuppliers, listCostCenterGroups, listCostCenterCategories) sem que o módulo bank-statements precise de um port dedicado para estes dados. Os IDs ficam guardados no movimento; o lookup reverso (nome do fornecedor, nome do grupo) é feito no frontend via join local.

**CSV parser no adapter** — a lógica de parse de CSV/XLSX vive em `adapters/out/` e é usada pelo controller antes de chamar o use case. O use case recebe `ParsedMovement[]` já estruturado — independente do formato de origem.

**Conciliação multi-entidade via tabela separada** — os links entre um movimento e as suas entidades (faturas/contas) vivem em `bank_movement_entity_links` (e não como array na coluna do movimento). Razões: (1) permite queries inversas (qual movimento pagou esta fatura); (2) auditabilidade — cada link tem o montante da entidade no momento da conciliação; (3) re-conciliação limpa: `deleteByMovementId` + `saveAll` sem UPDATE de arrays. A entidade `BankMovement` não carrega os links em memória — são carregados pelo use case quando necessário.

**`conciliado_parcial` não é resolvido** — este estado não consta em `RESOLVED_STATUSES` propositalmente. O progresso da conciliação deve reflectir que ainda há uma diferença por explicar. O gestor tem de investigar e re-conciliar ou criar uma segunda justificação para o remanescente.

**Tolerância de 1€ na conciliação** — `PARTIAL_TOLERANCE_CENTS = 100` (1,00€). Cobre diferenças de arredondamento ou pequenas taxas bancárias sem marcar o movimento como parcial. Decidido empiricamente com base em casos reais de extratos portugueses.

**Learning hints só para single full match** — a aprendizagem automática de descrição → fornecedor só dispara quando (1) a conciliação é de entidade única e (2) o match é completo (diff ≤ 1€). Conciliações multi-entidade ou parciais são ambíguas e não devem ser aprendidas.

**`balanceAfter` calculado ao vivo, não lido do DB** — o valor raw guardado em `bank_movements.balance_after` vem do CSV/XLSX importado e nunca é atualizado. O `GetBankStatementUseCase` recalcula o saldo acumulado a partir do `openingBalance` do extrato para cada movimento devolvido, em ordem cronológica. Assim, qualquer edição manual ao saldo inicial reflecte-se imediatamente sem necessidade de batch update aos movimentos.

**Uma entidade só pode estar ligada a um movimento de cada vez** — `ReconcileMovementUseCase` verifica, antes de persistir, se alguma das faturas ou contas a pagar pedidas já existe em `bank_movement_entity_links` com um `movementId` diferente. Se sim, lança `EntityAlreadyReconciledError` (HTTP 409). Isto evita que a mesma fatura seja "paga" duas vezes em movimentos diferentes. Re-conciliar o mesmo movimento é permitido: os links anteriores são apagados e substituídos (`deleteByMovementId` + `saveAll`). O mesmo filtro é aplicado no `FindMovementCandidatesUseCase` para não apresentar como candidatos entidades já tomadas.

---

## Como testar

```bash
# Domínio e use cases (rápido, sem I/O):
npx jest --testPathPattern=src/modules/bank-statements

# Inclui invoices (search param):
npx jest --testPathPattern="bank-statements|list-invoices"
```

## Pontos de atenção / dívidas conhecidas

- CSV parser suporta formato Millennium BCP; outros bancos podem requerer adapter próprio.
- `suggest-matches` faz N queries ao DB (uma por movimento não resolvido); para volumes grandes, considerar batch query futura.
- `calculatedClosingBalance` no `ListBankStatementsUseCase` usa o valor persistido (pode estar desatualizado se movimentos forem alterados sem update ao header); o `GetBankStatementUseCase` recalcula ao vivo.
- O bucket `bank-statement-documents` no Supabase Storage deve ser criado manualmente com política de acesso público de leitura.
- Créditos (entradas) ficam automaticamente como `conciliado_sem_fatura` e fora do scope do drawer de classificação.
