# F3 — estado (Stock: linhas reais, fila útil e importação)

Task: `task-mestre-v1.2.md` §F3. Divisão acordada com o utilizador (2026-10-25): F3a → F3b → F3c, uma de cada vez, relatório e autorização entre elas.
Nota do utilizador: as faturas enviadas para o Stock passam a ser lançadas sempre por linhas («Por artigo» por omissão).

## F3a — revisão e conferências (feita, por publicar)
- Backend `stock-purchase-review` + gancho em `invoices`; frontend `StockPurchaseReviewDetailView`.
- Linha: IVA (líquido = total − IVA), referência do fornecedor, categoria financeira, loja; revisão: totais da fatura.
- Custo unitário pelo líquido (descontos repartidos); equipamento excluído não pesa nos outros artigos.
- Conferências: documento (bloqueia, 422 `document_not_reconciled`), Stock (só inventariáveis), categorias (pendência gravada ao confirmar, não bloqueia).
- Divisão por lojas com quantidades explícitas (um movimento por loja; RPC revalida a soma).
- Todas «Não é item de stock» → `excluded` sem movimento.
- Sugestão aprendida com `packagingChanged` (embalagem mudou → conferir fator).
- Migração `20261110100000_stock_review_f3a` (+ rollback) validada em PGlite: aplicar, reexecutar, IVA preenchido nas revisões por aplicar, divisão 7+5 → 175+125, recusa de soma errada, confirmação idempotente, excluded, rollback (movimentos intactos), reaplicar.
- Fora: NC devolução física vs. correção de preço (continua só no Financeiro); ecrã de pendências no Financeiro (a pendência fica na revisão).

## F3b — fila e remoção (por fazer)
Estados A extrair → Por mapear → Em revisão → Pronto → Movimentado (+ Falha de extração, Excluído); reprocessamento limitado e linhas manuais; sair «Cancelar revisões sem linhas»; histórico por filtro; «Retirar de Compras por rever» (motivo + auditoria, sem tocar no Financeiro; movimentada só por estorno).

## F3c — importar no Stock (por fazer)
«Importar fatura» no Stock com o leitor + duplicados da F1; pendência «Aguardando lançamento no Financeiro»; confirmação com validação documental mínima; conclusão posterior pelo Financeiro sem repetir quantidades.
