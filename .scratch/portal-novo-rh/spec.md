# Novo Portal do Colaborador ligado ao Novo RH

Aprovado pelo utilizador em 2026-10-18 (plano por fases; uma fase de cada vez com relatório).

## Objetivo
O Portal do Colaborador (`/portal`) passa a usar o Novo RH (ponto, escala, ausências, documentos, pedidos) em vez do RH antigo, sem misturar os dois registos de ponto na mesma organização.

## Decisões (utilizador, 2026-10-18)
- D-P1 Caminho: Fase 1 backend → Fase 2 interruptor por organização → Fase 3 saldos de abertura → Fase 4 piloto (demo, depois uma loja) → Fase 5 quiosque e fecho.
- D-P2 Histórico antigo: **só consulta** (RH antigo + «Histórico anterior» no Portal). Não se migra para o motor novo; o Novo RH começa na data de corte com saldos de abertura.
- D-P3 Quiosque: **no mesmo corte** que o Portal em cada organização (nunca dois registos de ponto em simultâneo).
- Regra mantida (pedido anterior do utilizador, ADR-0027): não misturar os dois registos de ponto.
- Data de corte recomendada: início de um período (fecho/salários).

## Estado atual (levantamento 2026-10-18)
- Portal: `/api/me/*`. Novo RH já servido: comunicados, documentos enviados, tarefas, solicitações, «quem está», visibilidade, banco de horas. RH antigo: `GET /me`, `POST /me/punches`, `/me/shifts` (+ colegas), `/me/documents` (+ download, replace), `/me/leave`, `/me/requests` (justificar falta, folga).
- Novo RH para o próprio: `/me/clock` (+ days, corrections, break/clock types, refuse), `/me/absences` (+ types, balances, cancel), `/me/approvals`, `/me/roster` (+ swaps), `/me/time-bank`, `/me/notifications`. Rota `/api/me` = `portal` (sem MFA, sem Admin).
- Quiosque: `/api/hr/kiosk/*` (RH antigo); `punch` do Novo RH recusa `source = kiosk`.

## Fase 1 — completar o backend do Novo RH (sem impacto no Portal atual)
Tickets em `issues/`:
- 01 Página inicial `GET /api/me/home` (estado de hoje e próximo turno pelo motor do Novo RH).
- 02 Colegas do turno no Novo RH (respeitar a regra de visibilidade).
- 03 Os meus documentos e recibos no Novo RH (listar, descarregar, substituir expirado).
- 04 Anexo da justificação de falta (upload pelo colaborador → `attachmentDocumentId`).
- 05 Tipo «Folga» (configuração / predefinição).

## Fora da Fase 1
Fase 2 feita (2026-10-18: interruptor, guardas do ponto antigo e do quiosque, tipos do Portal, adapter Novo RH no frontend). Saldos de abertura (Fase 3), piloto (Fase 4), quiosque no Novo RH e Caixa de pedidos → aprovações (Fase 5).
