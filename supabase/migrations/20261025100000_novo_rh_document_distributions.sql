-- Novo RH (FE-065): envio de um documento a vários colaboradores, com
-- confirmação de leitura opcional. O ficheiro fica guardado uma só vez
-- (bucket privado hr-documents, prefixo {org_id}/distributions/); cada
-- destinatário tem a sua linha (lido / confirmado). A lista de destinatários
-- fica congelada no envio e nunca é apagada (prova de entrega).
-- Rollback em docs/migrations/rollback/.

create table if not exists public.document_distributions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  -- { "type": "all" | "locations" | "departments" | "employees", "ids": [...] }
  audience jsonb not null,
  requires_confirmation boolean not null default false,
  status text not null default 'sent' check (status in ('sent', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint document_distributions_org_id_uq unique (org_id, id)
);
create index if not exists document_distributions_created_idx on public.document_distributions (org_id, created_at desc);

create table if not exists public.document_distribution_recipients (
  org_id uuid not null references public.organizations(id),
  distribution_id uuid not null,
  employee_id uuid not null,
  user_id text,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  confirmed_at timestamptz,
  primary key (org_id, distribution_id, employee_id),
  constraint document_distribution_recipients_fk foreign key (org_id, distribution_id) references public.document_distributions (org_id, id),
  constraint document_distribution_recipients_employee_fk foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
);
create index if not exists document_distribution_recipients_employee_idx on public.document_distribution_recipients (org_id, employee_id);

-- Prova de entrega: as linhas dos destinatários nunca se apagam.
create or replace function public.guard_document_distribution_recipients() returns trigger
language plpgsql as $$
begin
  raise exception 'document_distribution_recipients: a lista de destinatários não se apaga';
end;
$$;
drop trigger if exists document_distribution_recipients_no_delete on public.document_distribution_recipients;
create trigger document_distribution_recipients_no_delete before delete on public.document_distribution_recipients
  for each row execute function public.guard_document_distribution_recipients();

alter table public.document_distributions enable row level security;
alter table public.document_distribution_recipients enable row level security;
drop policy if exists "document_distributions: org-scoped all" on public.document_distributions;
create policy "document_distributions: org-scoped all" on public.document_distributions for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
drop policy if exists "document_distribution_recipients: org-scoped all" on public.document_distribution_recipients;
create policy "document_distribution_recipients: org-scoped all" on public.document_distribution_recipients for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
