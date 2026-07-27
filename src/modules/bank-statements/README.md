# Módulo: bank-statements

> Status: ativo
> Última atualização: 2026-07-28

---

## O que é e para que serve (perspectiva de negócio)

O módulo de Conciliação Bancária permite ao gestor financeiro importar extratos bancários e verificar se cada movimento está explicado — seja por uma fatura do sistema, um comprovativo avulso, uma taxa bancária automática, uma transferência interna ou outra justificativa válida. No final, o saldo calculado pelo sistema deve bater com o saldo do extrato bancário.

**O problema que resolve:**
Sem este módulo, o gestor não tem visibilidade sobre se o saldo do banco coincide com o registado no sistema, nem sabe quais saídas ficaram sem justificativa, expostas a risco ou simplesmente esquecidas.

**O fluxo do ponto de vista do negócio:**

```
Gestor Financeiro
────────────────────────────────────────────────────────────
1. Entra na conta bancária → vê calendário anual com 12 cartões de mês
2. Cada cartão mostra: % de cobertura (dias com movimentos / dias do mês)
   e % de conciliação (movimentos resolvidos / total de movimentos)
3. Importa extrato (CSV ou XLSX) de qualquer mês ou período:
   - Sistema detecta banco, conta, período, saldos e movimentos
   - Movimentos duplicados (já importados) são ignorados automaticamente
   - Pode importar extratos com datas sobrepostas sem criar duplicados
4. Clica num mês → vista de dia a dia com todos os movimentos desse mês,
   agrupados por data de lançamento
5. Clica num movimento para conciliar ou classificar:
   - Se já resolvido → painel mostra resumo da classificação actual
     (entidades conciliadas, tipo de justificação, fornecedor, centro de custo)
     com opção "Alterar classificação" para re-abrir o formulário
   - Se pendente → formulário com duas tabs:
     a. "Conciliar com sistema" — selecciona uma ou mais faturas/contas a pagar e
        indica quanto deste movimento paga cada uma. Suporta pagamentos parciais,
        pagamentos agrupados e pagamentos faseados. Só aparecem entidades com
        saldo em aberto.
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
- **Conciliação multi-entidade** — um único pagamento bancário pode cobrir várias faturas em simultâneo (ex: pagamento agregado ao mesmo fornecedor). O gestor selecciona cada fatura e indica quanto deste pagamento lhe corresponde; o sistema valida que a soma não excede o valor do movimento e que cada fatura não fica a receber mais do que o seu saldo em aberto. Também suporta o inverso: a mesma fatura paga por vários movimentos em momentos diferentes (pagamento faseado).
- **Conciliação parcial** — movimento já associado a entidades, mas com diferença de montante superior a 1€. Sinaliza que algo ficou por explicar: pode faltar uma fatura, ou o pagamento incluiu uma taxa não registada.
- **Saldo calculado** — saldo que o sistema computa somando/subtraindo os movimentos; deve coincidir com o saldo final do extrato.
- **Saída não justificada** — débito sem fatura, sem regra, sem contrato e sem explicação manual.
- **Regra automática** — padrão de texto na descrição bancária que classifica automaticamente futuros movimentos similares (ex: "COM.MAN.CONTA" → taxa bancária).
- **Sugestão** — correspondência provável que o sistema encontrou entre um movimento e uma fatura/conta a pagar; pendente de confirmação pelo gestor. O sistema aprende com conciliações exactas passadas para melhorar as sugestões futuras.
- **Comprovativo** — ficheiro (PDF ou imagem) que justifica uma despesa sem fatura no sistema (ex: recibo de uma compra pontual, taxa bancária manual).
- **Centro de custo** — classificação interna da despesa (grupo + categoria) para efeitos de DRE e cashflow; obrigatório em todos os tipos de justificação que não sejam transferências internas.
- **IVA** — registado como taxa percentual + indicador de inclusão no valor (incluído/excluído/isento); os relatórios financeiros usam esta informação para calcular o valor líquido da despesa.
- **Saldo em aberto** — o que falta pagar de uma fatura ou conta a pagar, depois de descontar o que outros movimentos bancários já lhe alocaram. Se uma fatura de 1.000 € tiver um pagamento parcial de 600 € registado noutro movimento, o saldo em aberto é 400 €. O sistema apresenta sempre este valor atualizado ao gestor, para que saiba exatamente quanto pode ainda imputar a essa fatura.
- **Calendário mensal** — a visão principal de uma conta bancária: um cartão por mês do ano, mostrando o grau de cobertura e de conciliação. O gestor navega pelo calendário para perceber rapidamente que meses estão completos e quais precisam de atenção.
- **Cobertura** — percentagem de dias do mês que têm pelo menos um movimento bancário registado (ex: 18/31 dias = 58%). Indica se o extrato desse mês foi importado. Um mês com 0% de cobertura não tem extrato ainda.
- **Slot de dia** — agrupamento de todos os movimentos de uma conta numa data de lançamento específica, independentemente do extrato de que vieram. Permite conciliar dia a dia mesmo que tenham sido importados extratos sobrepostos (ex: extrato de 1–17 e extrato de 15–30 do mesmo mês — os dias 15–17 aparecem num único slot sem duplicados).

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

`bankAccountId` — FK opcional para `bank_accounts.id`. Preenchido no import quando a conta é conhecida (via auto-link por IBAN ou injecção directa). Permite queries de calendário directamente sobre `bank_movements` sem passar pelo import header.

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
Registo de ligação individual entre um `BankMovement` e uma entidade do sistema (fatura ou conta a pagar) no contexto de uma conciliação. Cada conciliação pode ter um ou mais links, e a mesma entidade pode ter links de vários movimentos diferentes (pagamento faseado). Guardado na tabela `bank_movement_entity_links`.

Campos:
- `movementId` — FK para `bank_movements`
- `entityType` — `"invoice"` ou `"payable_entry"`
- `entityId` — ID da entidade no sistema
- `amountCents` — total da entidade no momento da conciliação (snapshot histórico imutável)
- `allocatedAmountCents` — porção do `amount` do movimento atribuída a esta entidade; `<= amountCents` e `<= saldo em aberto` no momento da conciliação
- `entityLabel` — label legível, ex: `"Galp Energia — FT 2026/42"`

Ao re-conciliar um movimento, os links anteriores são apagados e substituídos pelos novos. O cálculo do saldo em aberto de cada entidade factora de volta as alocações saintes do próprio movimento, evitando falsos erros de over-allocation.

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
- `ReconcileMovementPort` — vincula um movimento a uma ou mais faturas/contas a pagar com alocação explícita por entidade. Validações: (1) `allocatedAmountCents > 0` por link; (2) `sum(allocatedAmountCents) ≤ movement.amount`; (3) por entidade, `allocatedAmountCents ≤ saldo em aberto` (total da entidade − alocações existentes de outros movimentos + alocações saintes do próprio movimento para re-conciliação). Determina o status: `conciliado_com_fatura` se `|diff| ≤ 1€`, `conciliado_parcial` caso contrário. Guarda learning hint apenas para conciliações de entidade única com match exacto de montante.
- `ClassifyMovementPort` — classificação manual com suporte a `costCenterGroupId`, `costCenterCategoryId`, `supplierId`, `vatRate`, `vatIncluded` e `documentUrl`.
- `UploadMovementDocumentPort` — faz upload de ficheiro para Supabase Storage e devolve a URL pública; o movimento em si não é alterado (a URL é passada no classify subsequente).
- `ApplyAutoRulesPort` — aplica todas as regras ativas aos movimentos não resolvidos de um import.
- `SuggestMatchesPort` — gera sugestões de correspondência por valor + data + nome do fornecedor.
- `FindMovementCandidatesPort` — devolve candidatos pontuados (fatura + conta a pagar) para um movimento específico; usado pelo drawer de classificação. Cada candidato inclui `openBalanceCents` (saldo em aberto da entidade). **Filtro por saldo:** entidades com `openBalanceCents = 0` (totalmente alocadas a outros movimentos) são excluídas; entidades com alocação parcial são incluídas com o saldo residual. Payable entries associadas a uma fatura que já aparece na lista de candidatos são omitidas (evita dupla contagem).
- `CreateReconciliationRulePort` — cria regra automática.
- `ListReconciliationRulesPort` — lista regras.
- `DeleteReconciliationRulePort` — remove regra.
- `CloseStatementPort` — fecha conciliação (valida balance diff = 0 e ausência de movimentos bloqueantes de alto risco).
- `DeleteBankStatementPort` — elimina import e movimentos (CASCADE).
- `UpdateStatementBalancesPort` — corrige saldo inicial/final manualmente.
- `LinkStatementToAccountPort` — associa manualmente um import a uma conta cadastrada (usado quando o auto-link falhou na importação).
- `GetAccountCalendarPort` — agrega os movimentos de uma conta por mês para um dado ano; devolve `AccountMonthStat[]` com cobertura (dias com ≥1 movimento / total de dias do mês) e progresso de conciliação por mês. Para o ano corrente devolve apenas os meses até ao mês actual.
- `GetAccountMonthDetailPort` — devolve os movimentos de uma conta num mês específico agrupados por dia (`DaySlot[]`), com totais de débito/crédito e contagem de resolvidos por dia. Os entity links são carregados em bulk.

### Saída (dependências do domínio)

- `BankStatementImportRepositoryPort` — save, findById, findAll, update.
- `BankMovementRepositoryPort` — saveBulk, findByStatementId, findById, update, existsByHash, `findByAccountAndPeriod(bankAccountId, from, to)` (usado pelos use cases de calendário).
- `BankAccountReadPort` *(cross-module)* — `findByAccountNumber`, `findById`; permite ao módulo tentar auto-link sem depender directamente de bank-accounts.
- `BankReconciliationRuleRepositoryPort` — save, findAll, findById, update, delete.
- `DocumentStoragePort` — store(buffer, filename, mimeType) → URL pública.
- `BankMovementEntityLinkRepositoryPort` — `saveAll`, `findByMovementIds` (bulk por movimento — usado para carregar links do próprio movimento em re-conciliação), `findByEntityIds(entityType, entityIds)` (bulk por entidade — usado para calcular alocações existentes e saldo em aberto), `deleteByMovementId` (para re-conciliação).
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
GET    /api/bank-statements/rules                                              listar regras (?activeOnly=true)
POST   /api/bank-statements/rules                                              criar regra
DELETE /api/bank-statements/rules/:ruleId                                     remover regra
PATCH  /api/bank-statements/:id/link-account                                  associar import a uma conta (body: { bankAccountId })
GET    /api/bank-statements/accounts/:accountId/calendar?year=YYYY            calendário anual da conta (AccountMonthStat[])
GET    /api/bank-statements/accounts/:accountId/calendar/:year/:month         detalhe mensal (DaySlot[])
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

**Paradigma de calendário: `bank_account_id` directamente em `bank_movements`** — a navegação primária deixou de ser "lista de imports" para passar a ser "calendário por conta". O problema do modelo anterior era que importar dois extratos com datas sobrepostas (ex: dias 1–17 e dias 15–30) obrigava a conciliar os dias sobrepostos duas vezes. A solução: cada movimento guarda `bank_account_id` directamente, e a deduplicação por hash garante que movimentos repetidos num reimport são ignorados. O `BankStatementImport` é mantido como "artefacto de auditoria" (regista que houve um upload, quando, e quantos movimentos vieram), mas a navegação e o calendário são construídos sobre `bank_movements` directamente via `findByAccountAndPeriod`. A agregação por mês é feita em memória no use case (volumes típicos de 50–200 movimentos/mês são negligenciáveis).

**Learning hints só para single full match** — a aprendizagem automática de descrição → fornecedor só dispara quando (1) a conciliação é de entidade única e (2) o match é completo (diff ≤ 1€). Conciliações multi-entidade ou parciais são ambíguas e não devem ser aprendidas.

**`balanceAfter` calculado ao vivo, não lido do DB** — o valor raw guardado em `bank_movements.balance_after` vem do CSV/XLSX importado e nunca é atualizado. O `GetBankStatementUseCase` recalcula o saldo acumulado a partir do `openingBalance` do extrato para cada movimento devolvido, em ordem cronológica. Assim, qualquer edição manual ao saldo inicial reflecte-se imediatamente sem necessidade de batch update aos movimentos.

**Modelo de alocação N:M em vez de exclusividade 1:1** — a ligação entre movimento e entidade armazena `allocatedAmountCents` (porção do movimento que paga aquela entidade) separado de `amountCents` (total da entidade, snapshot). Isto suporta: (1) pagamento parcial — um movimento cobre parte de uma fatura; (2) pagamento agrupado — um movimento cobre várias faturas; (3) pagamento faseado — várias movimentos cobrem a mesma fatura em prestações. A validação não é de exclusividade mas de saldo: `allocatedAmountCents ≤ openBalance` onde `openBalance = entityTotal − sum(todasAlocações) + alocaçõesSaintes`. O guard `EntityAlreadyReconciledError` foi removido. `FindMovementCandidatesUseCase` filtra entidades com `openBalance = 0` (totalmente pagas) mas inclui as com saldo residual, devolvendo `openBalanceCents` em cada candidato para o UI exibir.

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
- Créditos (entradas) ficam automaticamente como `conciliado_sem_fatura` ao importar. No drawer de classificação, ao clicar num crédito já conciliado, é exibido um cartão informativo a explicar que foi auto-resolvido — o gestor pode sempre usar "Alterar classificação" para reclassificar manualmente se necessário.
