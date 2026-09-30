-- Módulo Stock (Compra por rever) — override explícito por fatura. `auto`
-- (default) deixa a categoria/subcategoria + preferência do fornecedor
-- decidir. Sem constraint de "motivo obrigatório" aqui de propósito: um
-- `force_skip` sem motivo nunca bloqueia o lançamento da fatura — em vez
-- disso, o módulo Stock trata-o como decisão inconclusiva (UNRESOLVED,
-- nunca confia num "não criar revisão" não justificado quando a categoria/
-- fornecedor normalmente geraria uma), ver stock-purchase-review.

alter table public.invoices
  add column if not exists stock_review_override text not null default 'auto'
    check (stock_review_override in ('auto', 'force_create', 'force_skip')),
  add column if not exists stock_review_override_reason text;
