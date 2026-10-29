# Classificar movimentos sem os conciliar (pedido de 2026-10-29)

Até aqui, para um movimento sem fatura entrar na rubrica certa da DRE era preciso «justificá-lo» (ex.:
recibo/comprovativo sem documento), o que o marcava como conciliado sem o estar (em 2026: 159 saídas
assim — 140 por regras, 19 à mão). Separamos **classificar** (categoria para a DRE) de **conciliar**
(ligar ao documento).

## Ações no painel do movimento

| Ação | Grava | Estado | Conta como conciliado |
|---|---|---|---|
| **Classificar** | categoria (obrigatória), fornecedor e IVA (opcionais), nota | `pendente_de_documento` — «Classificado · aguarda fatura» | Não |
| **Conciliar com documento** | ligação à fatura / conta a pagar / recorrência; categoria e IVA do documento | conciliado | Sim |
| **Justificar sem documento** | comissão bancária, transferência interna, empréstimo, sem justificativa… | justificado | Sim |

- DRE: o movimento classificado entra pela sua categoria (IVA estimado pela taxa); com a fatura ligada,
  mandam a categoria e o IVA da fatura (já é assim na DRE).
- Fatura com categoria diferente da classificação: fica a da fatura, **com aviso** no painel.
- As sugestões de faturas continuam a aparecer para os movimentos classificados (não estão resolvidos).
- Indicadores do mês: além da «% conciliado», a «% classificado» (com categoria ou resolvido).

## Regras de movimentos recorrentes

Cada regra escolhe: **só classificar** (fica à espera da fatura — ex.: Makro, fornecedores) ou
**justificar de vez** (ex.: comissões bancárias, que nunca têm fatura). Coluna nova
`bank_reconciliation_rules.classify_only` (migração).

## Movimentos já justificados sem documento (decisão do utilizador)

Comissões bancárias, comissões do TPA e salários continuam justificados (e classificados); os restantes
«justificados com recibo» sem documento passam a «classificado, aguarda fatura» (a DRE não muda). Fazer com
uma lista prévia para o utilizador confirmar antes de gravar.

## Fases

1. **F1 (backend)** — `classifyOnly` no domínio e no endpoint de classificar; regras com `classify_only`
   (migração); «% classificado» nas estatísticas do mês.
2. **F2 (frontend)** — painel com as três ações; aviso de categoria diferente; «% classificado» nos meses;
   opção nas regras.
3. **F3** — conversão dos movimentos existentes (lista prévia + confirmação).
