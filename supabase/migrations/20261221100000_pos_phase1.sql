-- POS do Mezza — fase 1: produtos da caixa, configuração e registo das vendas.
-- Os documentos fiscais (FR/NC) são do módulo invoicing; aqui fica a ligação
-- venda ↔ documento, o funcionário, o meio de pagamento e as linhas vendidas.
-- Idempotente. Rollback: docs/migrations/rollback/20261221100000_pos_phase1.sql

create table if not exists public.pos_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  ref text not null check (length(ref) between 1 and 60),
  name text not null check (length(name) between 2 and 200),
  category text check (category is null or length(category) <= 60),
  price_cents integer not null check (price_cents between 0 and 1000000),
  vat_rate smallint not null check (vat_rate in (6, 13, 23)),
  product_type text not null default 'P' check (product_type in ('P', 'S')),
  track_stock boolean not null default false,
  image_url text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 500)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_products_ref_uq unique (org_id, ref)
);
create index if not exists pos_products_org_idx on public.pos_products (org_id, active);

create table if not exists public.pos_settings (
  org_id uuid primary key references public.organizations(id),
  invoice_series_ref uuid,
  credit_series_ref uuid,
  manager_employee_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Registo das vendas e devoluções: append-only (o documento fiscal é a prova; isto liga-o à caixa).
create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('sale', 'refund')),
  document_id uuid not null,
  document_number text not null check (length(document_number) <= 60),
  employee_id uuid not null,
  employee_name text not null check (length(employee_name) <= 200),
  payment_method text not null check (payment_method in ('card', 'cash', 'mbway')),
  total_cents integer not null check (total_cents >= 0),
  given_cents integer check (given_cents is null or given_cents >= 0),
  change_cents integer check (change_cents is null or change_cents >= 0),
  refund_of uuid references public.pos_sales(id),
  reason text check (reason is null or length(reason) <= 200),
  lines jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pos_sales_document_fk foreign key (org_id, document_id) references public.invoicing_documents (org_id, id),
  constraint pos_sales_refund_ck check ((kind = 'refund') = (refund_of is not null) and (kind = 'sale' or reason is not null))
);
create index if not exists pos_sales_org_time_idx on public.pos_sales (org_id, created_at);
create index if not exists pos_sales_refund_of_idx on public.pos_sales (refund_of) where refund_of is not null;

drop trigger if exists pos_sales_immutable on public.pos_sales;
create trigger pos_sales_immutable before update or delete on public.pos_sales
  for each row execute function public.invoicing_forbid_changes();
drop trigger if exists pos_sales_no_truncate on public.pos_sales;
create trigger pos_sales_no_truncate before truncate on public.pos_sales
  for each statement execute function public.invoicing_forbid_changes();

-- ── Privilégios e RLS: escrita só pelo backend; leitura por organização ──────
revoke insert, update, delete, truncate on public.pos_products from anon, authenticated;
revoke insert, update, delete, truncate on public.pos_settings from anon, authenticated;
revoke insert, update, delete, truncate on public.pos_sales from anon, authenticated;
revoke update, delete, truncate on public.pos_sales from service_role;

alter table public.pos_products enable row level security;
drop policy if exists "pos_products: org-scoped read" on public.pos_products;
create policy "pos_products: org-scoped read" on public.pos_products
  for select to authenticated using (org_id = current_org());

alter table public.pos_settings enable row level security;
drop policy if exists "pos_settings: org-scoped read" on public.pos_settings;
create policy "pos_settings: org-scoped read" on public.pos_settings
  for select to authenticated using (org_id = current_org());

alter table public.pos_sales enable row level security;
drop policy if exists "pos_sales: org-scoped read" on public.pos_sales;
create policy "pos_sales: org-scoped read" on public.pos_sales
  for select to authenticated using (org_id = current_org());
