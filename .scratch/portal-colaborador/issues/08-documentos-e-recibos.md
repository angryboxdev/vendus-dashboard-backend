Status: done (backend)
Blocked by: 03

# Documentos e recibos

`GET /api/me/documents` (atuais do próprio, sem removidos), `GET /api/me/documents/:id/download-url` (URL assinada; documento de outro colaborador → 404). Separador Recibos = filtro por categoria de recibo, por `period` (OUT 2026, SET 2026…). Download compatível com Safari iOS (sem `window.open` depois de await).
Teste crítico: Carlos não abre documento de Gabriel por URL/API.
