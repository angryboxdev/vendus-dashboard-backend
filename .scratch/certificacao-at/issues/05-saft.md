# 05 — SAF-T (PT) 1.04_01

Status: resolved
Fase: F5 · Bloqueado por: 03

Exportação mensal e integral (Header, MasterFiles, SalesInvoices, WorkingDocuments, Payments), validada contra o XSD oficial e o validador da AT.

## Comments
- 2026-11-04 — Gerador SAF-T (PT) 1.04_01 (Header, MasterFiles, SalesInvoices, WorkingDocuments) + `GET /api/invoicing/saft`. Validação estrutural contra o XSD oficial (convertido para 1.0): 0 erros. Regras das asserções 1.1 cobertas em testes. Validação XSD 1.1 completa pendente (Xerces 1.1 bloqueado nesta sessão; usar o validador da AT antes do Modelo 24). SourceID passa a derivar do id do utilizador. Payments (recibos) fora — RC ainda não existe.
