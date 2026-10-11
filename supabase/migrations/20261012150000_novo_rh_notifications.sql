-- Novo RH — Fase 1, ticket 10: fila de notificações (Eng. Reversa 13.1
-- `notification`). Fase 1: canal na aplicação; e-mail/push ficam para a
-- decisão D12 (Fase 9) — a coluna `channel` já os prevê. Só objetos novos.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  recipient_user_id uuid not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'push')),
  kind text not null check (kind ~ '^[a-z0-9_.]{3,80}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text check (body is null or length(body) <= 1000),
  link text check (link is null or (link ~ '^/[^/]' and length(link) <= 300)),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'read')),
  attempts integer not null default 0,
  last_error text,
  -- Evita duplicados quando o mesmo evento é processado duas vezes.
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  constraint notifications_member_fk foreign key (org_id, recipient_user_id) references public.org_members (org_id, user_id) on delete cascade
);
create index if not exists notifications_recipient_idx on public.notifications (org_id, recipient_user_id, created_at desc);
create index if not exists notifications_queue_idx on public.notifications (status, channel) where status = 'queued';
create unique index if not exists notifications_dedupe_uq on public.notifications (org_id, recipient_user_id, dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
drop policy if exists "notifications: org-scoped all" on public.notifications;
create policy "notifications: org-scoped all" on public.notifications for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
