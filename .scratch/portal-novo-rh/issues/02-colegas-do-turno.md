# Colegas do turno no Novo RH

Status: resolved
Fase: 1

Equivalente a /me/shifts/:id/coworkers sobre roster_shifts publicados, respeitando a regra de visibilidade dos turnos dos colegas (ADR-0030: desligado por omissão).

## Answer
`GET /api/me/roster/shifts/:id/coworkers` (rosters.myShiftCoworkers): mesma escala, turno publicado com horário sobreposto (inclui noturnos de dias vizinhos), só nome curto, cargo e horário. Respeita `security.visibility.coworkers_shifts` (desligado por omissão — ADR-0030): desligado → 403. **Diferença para o Portal antigo:** lá os colegas eram sempre visíveis; para manter o mesmo comportamento é preciso ligar a regra em Configurações.
