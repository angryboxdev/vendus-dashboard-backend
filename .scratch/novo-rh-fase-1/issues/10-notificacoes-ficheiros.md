# 10 — Notificações e ficheiros

Status: resolved
Blocked by: 03

Outbox/fila de notificações com canal na app; validação partilhada de tipo/tamanho de ficheiros; URLs assinadas temporárias (reutiliza storage).

## Comments

2026-10-11 — feito: módulo notifications (migração 20261012150000) + src/infra/http/file-validation.ts (tipo pelo conteúdo, tamanho; usado pelos uploads do Novo RH a partir da Fase 2). URLs assinadas já existiam (objectStorage.createSignedUrl). Outbox transacional fica como dívida.
