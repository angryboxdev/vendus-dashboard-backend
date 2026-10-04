Status: done

# Locais

CRUD de `locations` no módulo `locations` (criar, editar, inativar; nunca apagar). Campos: nome, código, morada, código postal, localidade, município, país, timezone, telefone, estado. Auditoria própria. Aba Locais.

## Comments

- 2026-10-04 — Implementado no módulo `locations` (backend + frontend).
  Migração `20261004110000_locations_management.sql` (**pendente de aplicação
  manual**): `code` passa a opcional, colunas postal_code/city/municipality/
  country/phone, `location_audit_logs`. Gestão só admin, nunca DELETE.
  Frontend: aba `/empresa/locais`; local implícito e seletores passam a
  considerar só locais ativos (evita 400 nas escritas de stock com 1 ativo +
  N inativos). Ligação a centro de custo fora (spec D7).
