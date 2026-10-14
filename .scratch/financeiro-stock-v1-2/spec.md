# Fornecedores, Financeiro e Stock — v1.2 (task mestre, 14/10/2026)

Status: F1 em curso (F2–F4 só com autorização, uma fase de cada vez).
Fonte: TASK_Mezza_Integracao_Financeiro_Stock_Fornecedores_v1_2.md (substitui v1.0/v1.1).

## Inspeção (2026-10-14) — o que existe

**Financeiro (`invoices`, `payable-entries`, `bank-statements`)**
- `invoices`: org_id, supplier_id, supplier_name, supplier_nif_snapshot (texto livre), invoice_number (texto; série+número juntos),
  invoice_date, due_date, totais bigint cêntimos (subtotal/vat/total), document_type invoice|credit_note (NC guardada negativa),
  line_detail_mode simple|detailed, stock_review_override, reconciliation_status, attachment_url (sem hash/versões).
  Sem entidade compradora, sem ATCUD, sem série separada, sem país do emitente, sem descontos, sem versão.
- `invoice_lines`: quantity numeric, unit_cost_without_vat/vat_amount/total_with_vat em cêntimos, vat_rate %, type (Outro/Salário/Imposto…),
  cost_center_category_id, location_id. Sem desconto nem bruto/líquido.
- Backend não calcula valores (aceita cêntimos do cliente); extração IA pede cêntimos sem descontos; frontend calcula em float em 3 sítios.
- Duplicados: `findDuplicate` por número (ilike) + fornecedor/NIF; aviso na importação, 409 em confirmar/criar; sem unique na BD → corrida.
  Reimportar o mesmo PDF cria novo rascunho.
- `payable_entries`: 1 por fatura só por verificação em código (sem unique); não é re-sincronizada quando total/vencimento mudam;
  "overdue" nunca persistido. Saldo aberto só em bank-statements (total − alocações).
- Sem idempotência, sem auditoria, sem controlo de versão, sem transação nos fluxos de várias escritas.

**Stock (`stock-purchase-review`, import legado `/api/stock/invoice-imports`)**
- `stock_purchase_reviews` UNIQUE(invoice_id); `stock_review_lines` cópia das linhas (UNIQUE invoice_line_id); confirmação atómica por RPC
  com movimentos idempotentes por linha (`reference stock_review:<review>:<line>`), lock otimista por `version`.
- Import legado do Stock: duplicados por business_key (fornecedor+número+data) só contra imports confirmados; override APAGA movimentos
  anteriores; sem ligação a `invoices` → mesma fatura pode entrar duas vezes no stock; registo pode ficar em `processing` para sempre.
- NC sem tratamento no Stock. Sweep de recuperação nunca cria revisões (lista faturas sem linhas).

## Decisões F1 (opções compatíveis com os dados existentes)

- D1 Identidade fiscal numa tabela própria `fiscal_document_identities` com UNIQUE(org, entidade compradora, país+NIF normalizado do emitente,
  tipo, série/número normalizado) — a unicidade aplica-se à identidade, não às faturas legadas. Histórico é reconhecido por backfill;
  colisões históricas ficam como "suspeitas" (relatório), nunca fundidas nem apagadas.
- D2 Entidade compradora: `invoices.legal_entity_id` opcional; chave usa a entidade quando conhecida (senão a organização). Não se inventa NIF.
- D3 Série/número: preservar texto exato; normalização só para comparar (maiúsculas, espaços), mantendo zeros e separadores significativos.
- D4 Motor único de valores no domínio (cêntimos inteiros + quantidades decimais exatas), espelhado no frontend com os mesmos vetores de teste.
- D5 Obrigação financeira: UNIQUE(invoice_id) nas contas a pagar ativas, aplicado só depois do relatório de duplicados históricos.
- D6 Segurança: versão por fatura (409 em conflito), auditoria (autor/origem/antes/depois/motivo), Idempotency-Key opcional nas escritas.
- D7 Import legado do Stock passa pela mesma verificação de identidade; o "override" deixa de apagar movimentos (recusa duplicado).
