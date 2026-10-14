# Identidade fiscal partilhada entre Financeiro e Stock

Decidido em 2026-10-14 (Task mestre v1.2 Fornecedores/Financeiro/Stock, F1 §1.2).

## Contexto

Inspeção: `invoices` sem unicidade por fornecedor+número (verificação em código,
com corrida); reimportar o mesmo PDF criava novo rascunho; o import legado do
Stock (`supplier_invoice_imports`) não se cruzava com as faturas e, com
"override", apagava movimentos de outra importação. Havia risco real de dívida
e stock duplicados. Os dados históricos podem conter duplicados, por isso não
se pode impor uma restrição única diretamente às faturas.

## Decisões

- Tabela própria `fiscal_document_identities` com UNIQUE na chave forte
  (org, comprador, país, NIF, tipo, série/número normalizado), na fatura e na
  importação. Inserir-se-não-existe; a violação de unicidade devolve a
  identidade que ganhou → pedidos simultâneos convergem.
- Normalização sem inventar: NIF português só com dígito de controlo válido;
  estrangeiro só com país explícito; série/número preserva zeros e
  separadores. Identidade incompleta → fica em rascunho/revisão.
- Possíveis duplicados (mesmos grupos numéricos, formatação diferente) → 409
  para comparação manual; nunca fusão automática.
- Financeiro: confirmar/criar/corrigir reservam a identidade antes de
  finalizar; criar compensa (retira a fatura) se a reserva falhar. "Completar
  lançamento existente" liga ao documento do Stock e desliga uma nova revisão
  de stock (sem duplicar quantidades). Apagar liberta a chave se o documento
  nunca chegou ao Stock.
- Stock legado: passa a extrair/guardar NIF, exige identidade completa para
  movimentar e recusa documento já lançado no Financeiro; "override" deixou de
  substituir importações (não apaga movimentos).
- Histórico: `POST /api/fiscal-documents/backfill` simula por omissão
  (relatório de registos, duplicados e incompletos); a execução regista o mais
  antigo e liga fatura+importação do mesmo documento. A verificação antiga
  (número+fornecedor) mantém-se até o backfill ser executado.

## Consequências

- Faturas sem NIF (no documento e no fornecedor) deixam de poder ser
  finalizadas até o NIF ser preenchido.
- Entidade compradora: hoje `org` (a fatura ainda não escolhe entidade legal);
  a chave já a suporta.
