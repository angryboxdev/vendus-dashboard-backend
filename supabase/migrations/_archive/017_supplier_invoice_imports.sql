-- Importação de faturas de fornecedor (preview OpenAI + confirmação → stock_movements purchase)

create type public.supplier_invoice_import_status as enum (
  'uploaded',
  'processing',
  'ready_for_review',
  'failed',
  'confirmed',
  'cancelled'
);

create type public.supplier_invoice_line_status as enum (
  'matched',
  'needs_review',
  'ignored'
);

create table if not exists public.supplier_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  status public.supplier_invoice_import_status not null default 'uploaded',
  storage_bucket text not null default 'invoice-imports',
  storage_path text not null,
  file_name text not null,
  file_mime text not null,
  file_sha256 text not null,
  file_size int not null,
  supplier_name text,
  supplier_normalized text,
  invoice_number text,
  invoice_date date,
  currency text not null default 'EUR',
  subtotal numeric(14, 3),
  tax_total numeric(14, 3),
  total numeric(14, 3),
  business_key text,
  duplicate_warning boolean not null default false,
  duplicate_of_import_id uuid references public.supplier_invoice_imports (id) on delete set null,
  parse_error text,
  raw_openai_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.supplier_invoice_import_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.supplier_invoice_imports (id) on delete cascade,
  line_index int not null,
  description text not null,
  quantity numeric(14, 3) not null,
  unit text,
  unit_price_net numeric(14, 6),
  unit_price_gross numeric(14, 6),
  vat_rate numeric(8, 4),
  line_total_net numeric(14, 3),
  line_total_gross numeric(14, 3),
  stock_item_id uuid references public.stock_items (id) on delete set null,
  match_confidence numeric(5, 4),
  line_status public.supplier_invoice_line_status not null default 'needs_review',
  notes text,
  unique (import_id, line_index)
);

create index if not exists idx_supplier_invoice_imports_status on public.supplier_invoice_imports (status);
create index if not exists idx_supplier_invoice_imports_business_key on public.supplier_invoice_imports (business_key);
create index if not exists idx_supplier_invoice_imports_created_at on public.supplier_invoice_imports (created_at desc);
create index if not exists idx_supplier_invoice_import_lines_import on public.supplier_invoice_import_lines (import_id);

comment on table public.supplier_invoice_imports is 'Faturas de fornecedor: upload → parse OpenAI → confirmação → purchase em stock_movements';
comment on column public.supplier_invoice_imports.business_key is 'Chave única lógica (fornecedor+nº+data) para detetar duplicados';

alter table public.supplier_invoice_imports enable row level security;
alter table public.supplier_invoice_import_lines enable row level security;

create policy "Allow all for anon supplier_invoice_imports" on public.supplier_invoice_imports
  for all using (true) with check (true);
create policy "Allow all for anon supplier_invoice_import_lines" on public.supplier_invoice_import_lines
  for all using (true) with check (true);

-- Bucket Storage (ficheiros da fatura)
insert into storage.buckets (id, name, public)
values ('invoice-imports', 'invoice-imports', false)
on conflict (id) do nothing;

create policy "Allow anon upload invoice-imports"
  on storage.objects for insert
  with check (bucket_id = 'invoice-imports');

create policy "Allow anon read invoice-imports"
  on storage.objects for select
  using (bucket_id = 'invoice-imports');

create policy "Allow anon update invoice-imports"
  on storage.objects for update
  using (bucket_id = 'invoice-imports');

create policy "Allow anon delete invoice-imports"
  on storage.objects for delete
  using (bucket_id = 'invoice-imports');
