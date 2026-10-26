# Documento de pagamento: várias faturas fiscais, um só pagamento

Decidido em 2026-10-26 (pedido do utilizador, a partir de uma fatura das Águas do Porto).

## Contexto

As faturas de águas (Águas do Porto, Águas de Gaia, …) chegam num **documento de pagamento** com
**duas faturas fiscais** — água/saneamento (empresa das águas, IVA 6 %) e resíduos (outra
entidade, não sujeito a IVA) — cada uma com o seu QR AT, e **um só débito direto**. A importação
lia um só documento (a IA misturou as duas e o resumo da 1.ª página), a recorrência «Água» tinha
um só valor previsto e a conciliação só sabia juntar faturas do **mesmo** fornecedor.

## Decisão

- **Uma fatura por QR**, ligadas por `invoices.payment_group_id` (migração `20261130110000`). A IA
  corre uma vez; as faturas além da 1.ª saem do próprio QR (emitente pelo NIF, uma linha por taxa).
  Fornecedor e IVA ficam certos na contabilidade.
- **Uma recorrência para o pagamento** (escolha do utilizador, em vez de uma recorrência por
  emitente): a ocorrência liga-se a uma fatura do documento («âncora») e conta o documento todo —
  real = soma, pago = soma das conciliações. Sem tabela de ligação ocorrência↔faturas: o grupo é
  lido da fatura. Apagar a âncora passa a ligação a outra fatura do documento.
- **Conciliação**: o movimento cuja quantia é exatamente a soma em aberto do documento sugere-o
  inteiro, pelo caminho atómico da liquidação agrupada (`fn_reconcile_movement_grouped`).

## Consequências

- O grupo é só uma ligação: apagá-la (rollback) deixa as faturas intactas.
- Um documento com faturas de recorrências diferentes (ex.: «Água» e «Resíduos» separadas) gera
  sugestões em vez de associação automática.
- A importação a partir do Stock (`import-invoice-for-stock`) continua a tratar só a 1.ª fatura;
  as outras ficam como rascunhos no Financeiro.

## Revisão (2026-10-26, mesmo dia)

O utilizador preferiu **lançar tudo na empresa das águas**: um documento de pagamento com vários QR
passa a ser **uma só fatura** no emitente do 1.º QR (número, NIF e data dele), com a **soma** de todos
(o total do débito) e uma linha por taxa (ex.: água/saneamento 6 % + resíduos não sujeito). As outras
faturas fiscais ficam nas **notas** (número, emitente, NIF, valor). A importação deixa de criar faturas
irmãs; o `payment_group_id`, a recorrência do grupo e a sugestão do documento na conciliação ficam
para documentos antigos já separados (sem uso nos novos). A identidade fiscal só regista a 1.ª fatura.

Ainda no mesmo dia: o documento passa a ser lido **linha a linha** sem IA (`TaxCodeLinesLayout`, 9 linhas no caso das águas), conferido com a soma dos QR; as linhas por taxa do QR ficam só como último recurso.
