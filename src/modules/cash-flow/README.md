# Módulo: cash-flow

> Status: active
> Última atualização: 2026-10-26 (F1 — endpoint do fluxo de caixa, só a partir do banco)

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

## Portas

### Entrada (casos de uso)

- `GetCashFlowPort` — relatório do mês (`{ organizationId, year, month }`).

### Saída (dependências do domínio)

- `BankMovementReadPort` — débitos (com ligações a documentos) e créditos de todas as contas da organização num intervalo.
- `ExpenseSourceReadPort` — categoria das faturas, contas a pagar e ocorrências referidas.
- `CostCenterCatalogReadPort` — grupos e categorias de centro de custo.
- `MovementKindPort` — tipo genérico de um movimento a partir do descritivo do banco.

## Adapters

### Entrada

- `CashFlowController` → `GET /reports/dre/fluxo-caixa` (permissão `dre.statement`, READ).

### Saída

- `SupabaseBankMovementReadAdapter` → `bank_movements` (paginado) + `bank_movement_entity_links`.
- `SupabaseExpenseSourceReadAdapter` → `invoices`, `invoice_lines`, `invoice_allocations`, `payable_entries`, `recurring_occurrences`, `recurring_contracts`.
- `SupabaseCostCenterCatalogReadAdapter` → `cost_center_groups`, `cost_center_categories`.
- `BankStatementsMovementKindAdapter` → `DescribeMovementPort` do módulo `bank-statements`.

## Decisões de design

- **Só o banco (decisão do utilizador, 2026-10-26).** O extrato já mostra as entradas (TPA, plataformas…); o Vendus não entra neste ecrã — fica para a DRE.
- **Categoria calculada na leitura, não gravada no movimento.** Conciliar uma saída muda logo a categoria no relatório, vale para os meses já conciliados e não exige migração. Desfazer uma conciliação também se reflete sem sincronização.
- **Leitura direta das tabelas de outros módulos (só leitura).** É uma vista de relatório que cruza banco, faturas, recorrências e catálogo; ler por portas de entrada exigiria quatro portas novas só para isto. Segue o precedente de `payable-recurrences` (lê `bank_movements`). Nunca escreve nessas tabelas.
- **Tipo genérico pelo `bank-statements`.** As regras do descritivo vivem num só sítio (`normalizeMovement`); este módulo recebe-as pela porta `DescribeMovementPort` e devolve só a chave (`transfer_out`, `sales`…). O nome legível fica no frontend (`MOVEMENT_KIND_LABELS`).
- **% justificada por valor, não por número de movimentos** (ao contrário de `reconciledPercent` em `bank-statements`): uma saída grande por explicar pesa mais do que muitas pequenas.

## Como testar

- Domínio e caso de uso: `npx jest --config jest.config.cjs src/modules/cash-flow` (rápido, com fakes).
- Adapters: sem testes de integração (precisam da stack Supabase local).

## Lacunas conhecidas

- O mês só está completo quando todos os extratos das contas estão importados; não há aviso de contas em falta.
- Contas a pagar só têm grupo (sem categoria): sem fatura, ficam no grupo sem detalhe.
