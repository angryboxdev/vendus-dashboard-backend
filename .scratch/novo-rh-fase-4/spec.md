# Novo RH — Fase 4: registo de ponto e motor de assiduidade

Fonte: TASK §Fase 4; Eng. Reversa 3.1–3.5, 13.1; Configurações C6.1, C10.

## Âmbito
- Marcações append-only (web/PWA), idempotentes por `clientEventId`, com fila offline e hora do dispositivo (até 24 h).
- Motor diário puro: segmentos, pausas, noturno (D6), meia-noite, jornadas noturnas, tolerância, arredondamento, registo esquecido, incidentes.
- Revisões da gestão com motivo; recusa pelo colaborador no prazo (regra opcional).
- Pedidos de correção do colaborador; decisão por outra pessoa.
- Incidentes únicos; resolver/validar/dispensar; D8 (horas pendentes até validar).
- Dias apurados versionados com hash da configuração; ajustes quando o excedente muda (TK-13).
- Regras de bloqueio: IP, antes da hora, geofence (D7: desligada até DPIA).

## Fora do âmbito
- Quiosque/NFC/QR do Novo RH (o quiosque atual continua no RH atual).
- Substituir o Portal do Colaborador (só quando o Novo RH passar a principal).
- Notificações de correção/saída automática (Fase 9).

## Critérios
RE-5..RE-14, CF-1, CF-3, CF-4, CF-11, TK-13.
