# Novo RH — Fase 6: banco de horas

Fonte: TASK §Fase 6; Eng. Reversa 06 (6.1–6.3), 15.5; Configurações C4.5, C4.6, C6.5.

## Âmbito
- Ledger append-only: excedente/défice, multiplicador, feriado, compensação em descanso e paga, expiração, ajuste.
- Sincronização com os dias apurados da assiduidade até ao corte (mês vencido / até ontem — D11).
- Correção retroativa → ajuste datado de hoje com referência ao dia.
- Compensações limitadas ao disponível (salvo política) e ao limite anual pago.
- Validação de excedente com data de efeito (não retroativa).
- Horas categorizadas com fator (multiplicador) e relatório.

## Fora do âmbito
- Pedido de compensação pelo colaborador; avisos de vencimento (Fase 9).

## Critérios
RE-26..RE-29, CF-6, TK-15.
