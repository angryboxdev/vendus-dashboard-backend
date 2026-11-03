# 03 — Casos de uso e API de emissão

Status: todo
Fase: F3 · Bloqueado por: 02

Casos de uso: criar série (formação), emitir FT/FS/FR/NC/ND/CM, recibo RC, anular com motivo (bloqueios do Despacho 3.3.7–3.3.9), NC parcial limitada, 2.ª via com dados originais, recuperação de documento manual (M) e de duplicado (D). Rotas `/api/invoicing/*` classificadas em `route-permissions.ts` (`invoicing.read` / `invoicing.manage`), `npm run authz:matrix` com 0 não classificadas.
