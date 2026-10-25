# Module: notifications

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

Avisos dentro da aplicação para quem tem de saber de algo (ex.: alguém fez
uma alteração retroativa às regras). Cada pessoa vê só os seus e marca-os
como lidos. E-mail e push ficam para mais tarde (decisão D12).

**Key concepts for the business:**

- **Notificação** — aviso curto com título, texto e ligação para o ecrã certo.
- **Lida / por ler** — o contador mostra as que faltam ver.

---

## Technical purpose

Tabela `notifications` (canal `in_app`; `email`/`push` previstos) e a porta
`NotificationsPort` que os outros módulos recebem pelo composition root.
Não envia e-mails.

## Domain concepts

- Invariantes: tipo `[a-z0-9_.]`; título 1–160; texto ≤ 1000; ligação só para caminhos internos (`/…`, nunca `//` nem URL externa); um destinatário recebe o mesmo evento uma vez (`dedupeKey`).

## Ports

### Input (use cases)

- `NotificationsPort` — `notify`, `listMine`, `unreadCount`, `markRead`, `markAllRead`, `adminUserIds`.

### Output (domain dependencies)

- `NotificationStorePort`.

## Adapters

### Input

- `createNotificationsRouter` → `/api/me/notifications` (GET, `?unread=1`), `/unread-count`, `/:id/read`, `/read-all` (classificado "portal": cada um só as suas).

### Output

- `SupabaseNotificationStore` (migração `20261012150000`).

## Design decisions (ADR summary)

- Primeiro uso: alteração retroativa no motor de configurações avisa os Admins ativos.
- Duplicados (`dedupeKey`) sem `upsert` (2026-10-25): o índice único é parcial (`where dedupe_key is not null`) e o `ON CONFLICT` do PostgREST não o usa (42P10 → «Erro interno» ao publicar escalas, decidir ausências, etc.). O store filtra os já existentes antes de inserir e, numa corrida (23505), insere um a um ignorando os repetidos. Sem migração.
- Não é um outbox transacional de eventos de domínio (o Supabase REST não junta escritas numa transação) — dívida registada no relatório da Fase 1.

## How to test

- `npx jest --config jest.config.cjs src/modules/notifications`.

## Known gaps / open debt

- Canais e-mail/push (D12, Fase 9). Preferências por utilizador.
