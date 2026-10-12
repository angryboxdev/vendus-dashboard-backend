# Novo RH — Fase 5: ausências, férias e fluxos de aprovação

Fonte: TASK §Fase 5; Eng. Reversa 05 (5.1–5.4), 15.4; Configurações C5.1, C5.3, C6.4, C6.6.

## Âmbito
- Tipos de ausência com todas as regras declaradas (unidade, contagem, limite, renovação, aprovação, privada, oculta, anexo, impacto no tempo, interseção com o horário, meio dia, mín./máx., datas bloqueadas).
- Férias com as regras do calendário de férias atribuído (Fase 3).
- Pedidos: criar (colaborador), atribuir (gestão), cancelar; validações de contrato, saldo, datas, sobreposição.
- Fluxos de aprovação multinível com pessoas e papéis; sem autoaprovação; nível vazio → recurso + alerta (D9).
- Ledger append-only; acumulação por período; ajustes; anulações.
- Efeito na assiduidade (CF-7) e compensação de feriados trabalhados (CF-9).
- Permissão `hr.absences_private`.

## Fora do âmbito
- Expiração/transição automáticas e proporcionalidade (regras legais a validar).
- Alertas de pedidos parados (Fase 9).
- Substituir as ausências do Portal atual.

## Critérios
RE-19..RE-23, RE-25, CF-5, CF-7, CF-8, CF-9, TK-14.
