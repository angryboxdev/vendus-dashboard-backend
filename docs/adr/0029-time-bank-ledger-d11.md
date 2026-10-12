# Banco de horas em ledger append-only (Fase 6, D11)

Tomada com a opção recomendada (a mais segura) em 2026-10-12, por instrução
permanente do utilizador para seguir a recomendação sem perguntar.

## Decisões

- **Ledger append-only (TK-15):** o saldo é sempre a soma dos movimentos.
  Cada dia fechado gera **um** movimento diário (excedente ou défice, mesmo
  que 0), mais multiplicador e feriado quando existam. Nunca se reescreve.
- **Correção retroativa (RE-29):** quando um dia já lançado muda (marcação
  corrigida, ausência, configuração), a sincronização lança um **ajuste
  datado de hoje** com referência ao dia, pela diferença. O histórico não
  muda (o observado recalculava — risco registado em 6.3).
- **D11 — período:** por omissão **a mês vencido** (o observado); a opção
  "até ontem" fica disponível. Só entram dias até ao corte.
- **D11 — limites e expiração:** sem valor por omissão (sem limite de horas
  pagas, sem expiração). Os 80 h / 720 dias vistos são valores do
  fornecedor, não legais; RH decide. Horas negativas nunca expiram;
  a expiração consome primeiro as horas mais antigas.
- **Compensações** limitadas ao disponível (sem saldo negativo por omissão)
  e ao limite anual de horas pagas, quando definido (RE-28 → 422).
- **Validação de excedente (C6.5, CF-6):** parâmetro com data de efeito do
  motor de configurações; cada dia usa o valor em vigor nesse dia, por isso
  ligar a 01/11 não mexe em outubro. Excedente por validar não entra.
- **Multiplicadores e horas categorizadas (C4.6):** categorias com janelas
  por dia da semana; um fator > 1 gera o movimento "multiplicador" sobre o
  tempo trabalhado dentro da janela (ex.: 17–18 h × 1,5 → +30 min).
- **Feriados:** por omissão a compensação é em dias de férias (CF-9, Fase 5).
  Em modo "horas", o tempo trabalhado num feriado confirmado gera
  trabalhado × (coeficiente − 1) além do excedente normal.
- **Sincronização:** ao consultar (últimos 92 dias até ao corte) e a pedido
  ("Sincronizar", com período). Correções mais antigas entram na
  sincronização pedida.

## Consequências

- O fecho de período (Fase 8) bloqueia correções; o banco continua coerente
  porque só acrescenta movimentos.
