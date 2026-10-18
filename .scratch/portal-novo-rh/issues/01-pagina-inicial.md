# Página inicial GET /api/me/home

Status: resolved
Fase: 1

Estado de hoje (a trabalhar/pausa/terminou/ainda não começou, horas de hoje) e próximo turno publicado, calculados pelo motor do Novo RH (attendance myStatus + rosters). Sem dados do RH antigo.

## Answer
Resolvido sem endpoint agregador: a página inicial junta no Portal (Fase 2) `GET /api/me/clock` (estado e horas de hoje, motor do Novo RH), `GET /api/me/roster` (próximo turno publicado) e o novo `GET /api/me/profile` (módulo people: nome, foto, cargo, local, admissão — nunca campos sensíveis).
