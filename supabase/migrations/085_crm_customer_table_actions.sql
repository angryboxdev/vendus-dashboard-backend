-- CRM customer table: configurable statuses, a new action timeline and manageable tags.
-- This migration is intentionally idempotent. It is created here but must be
-- applied manually by the project owner.

alter table public.crm_tags
  add column if not exists label text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.crm_tags set label = name where label is null;
alter table public.crm_tags alter column label set not null;

create table if not exists public.crm_action_types (
  code text primary key,
  name text not null,
  color text not null default '#6b7280',
  active boolean not null default true,
  system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O catálogo começa vazio. Os tipos são criados pelos utilizadores através da
-- opção "Criar tipo de ação" no seletor de próxima ação.

create table if not exists public.crm_customer_actions (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.crm_customers(id) on delete cascade,
  action_type_code text not null references public.crm_action_types(code),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  notes text,
  script_code text,
  source_contact_id uuid unique references public.crm_contacts(id) on delete set null,
  source_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_customer_actions_dates_check check (
    status <> 'completed' or completed_at is not null
  )
);

create index if not exists crm_customer_actions_customer_idx
  on public.crm_customer_actions(customer_id);
create index if not exists crm_customer_actions_pending_idx
  on public.crm_customer_actions(status, scheduled_for)
  where status = 'pending';
create index if not exists crm_customer_actions_completed_idx
  on public.crm_customer_actions(customer_id, completed_at desc)
  where status = 'completed';

-- Intencionalmente sem backfill: contactos, scripts e follow-ups legados não
-- pertencem à nova timeline. Última e próxima ação começam vazias e só passam
-- a existir através da nova feature de ações.

insert into public.crm_parameters (key, value, description, category) values
  ('crm_new_no_order_days', '21', 'Dias sem pedido até considerar inativo um cliente sem pedidos', 'status'),
  ('crm_new_one_order_days', '30', 'Dias desde o último pedido até considerar inativo um cliente com 1 pedido', 'status'),
  ('crm_inactive_repeat_days', '60', 'Dias desde o último pedido até considerar inativo um cliente com 2+ pedidos', 'status')
on conflict (key) do nothing;
