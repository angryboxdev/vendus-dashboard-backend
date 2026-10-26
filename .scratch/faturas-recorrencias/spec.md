# Faturas ↔ recorrências + documentos de pagamento com várias faturas

Pedido do utilizador (2026-10-26). Ramo `financeiro-faturas-recorrencias` (backend e frontend), worktrees `*-fatrec`.

## Contexto
- Ao lançar uma fatura, associá-la sozinha à ocorrência da recorrência (fornecedor + categoria/sub-categoria) e passar o previsto a real. Decisões: mês da emissão, senão o anterior em aberto; vários candidatos → sugere e o utilizador escolhe; desvio ≥ 20 % → associa e avisa.
- Faturas de águas (Águas do Porto, Águas de Gaia, …) chegam num **documento de pagamento** com **dois QR fiscais** (água/saneamento e resíduos, emitentes diferentes) e **um só débito**. Decisões: **duas faturas ligadas** (uma por QR) e **uma recorrência para o pagamento** (a ocorrência aceita as faturas do mesmo documento; real = soma).

## Fases
- **F0 (feito, por publicar)** — associação automática fatura → recorrência (sugestões, desassociar, aviso de desvio, libertar ao apagar); QR em vetor noutras páginas e vários QR por página; linhas da IA conferidas com o QR (senão bases do QR por taxa); fornecedor por dica/nome com NIF ≠ QR recusado (+ aviso se a ficha tiver o NIF da própria empresa). Sem migração.
- **F1** — importação: um PDF com N QR fiscais cria N rascunhos (um por QR), com `invoices.payment_group_id` comum (migração). A IA corre uma vez; as faturas além da 1.ª saem do QR (emitente pelo NIF, uma linha por taxa). Revisão no frontend percorre as N.
- **F2** — recorrências: a ocorrência ligada a uma fatura de um grupo conta o grupo todo — real = soma do grupo, pago = alocações do grupo; associar/desassociar/sugestões tratam o grupo; a associação automática usa o fornecedor de qualquer fatura do grupo.
- **F3** — conciliação: o movimento cuja quantia bate com a soma em aberto de um grupo sugere o grupo inteiro (uma conciliação, alocação por fatura).
- **F4** — documentação (READMEs, CONTEXT/ADR se aplicável, estado atual) e publicação com aprovação.

## Regras
- Dados de teste sempre fictícios; faturas reais só na prova local `faturas-teste-privado` (fora do repo).
- Uma fase de cada vez; relatório no fim de cada fase.
