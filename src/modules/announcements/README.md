# Module: announcements

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Comunicados**: escrever um aviso, escolher para quem vai (todos,
centros, grupos ou pessoas), publicar e saber quem recebeu, leu e confirmou.

**Key concepts for the business:**

- **Destinatários congelados** — ao publicar, a lista fica fixa; não se muda depois.
- **Versão** — mudar o texto depois de publicado cria uma versão nova, que é entregue de novo; a confirmação é por versão.

---

## Technical purpose

Tabelas `announcements`, `announcement_versions` (append-only),
`announcement_recipients`, `announcement_receipts` — migração
`20261020100000` (com trigger que impede mudar o público depois de publicado).

## Domain concepts

- `validateDraft`, `receiptStatus` (entregue/lido/confirmado).

## Ports

### Input (use cases)

- `AnnouncementsUseCases` — criar, editar (rascunho ou versão nova), publicar, arquivar, relatório; os meus, ler, confirmar.

### Output (domain dependencies)

- `AnnouncementsRepositoryPort`, `AnnouncementsContextPort` (resolver público, conta ↔ ficha, notificar, relógio, auditoria).

## Adapters

### Input

- `createAnnouncementsRouter` → `/api/novo-rh/announcements/*` (`hr.employees`) e `/api/me/announcements*`.

### Output

- `SupabaseAnnouncementsRepository`.

## Design decisions (ADR summary)

- **FE-060/061/062:** lista com leituras e confirmações da versão atual; duplicar (novo rascunho); eliminar só rascunhos (publicados arquivam-se — a prova fica); público também por departamento; `POST …/audience-preview` conta os destinatários antes de publicar; `POST …/:id/remind` lembra quem ainda não leu/confirmou (um por dia, pela chave da notificação); `GET …/:id/proof.csv` = prova de leitura (BOM UTF-8, `;`, fórmulas neutralizadas).
- ADR-0033: RE-31 (destinatários congelados), RE-32 (recibos por versão), D12 (só notificações na aplicação).

## How to test

- `npx jest --config jest.config.cjs src/modules/announcements`.

## Known gaps / open debt

- Sem anexos nem agendamento de publicação.
