-- POS do Mezza — fase 2: stock próprio do POS, código de barras e vista do ecrã.
-- O stock é um registo append-only de movimentos (venda, devolução, entrada,
-- contagem); um trigger mantém o contador do produto na mesma transação, e a
-- venda registada em pos_sales gera os movimentos dos artigos que controlam
-- stock. Venda sem stock é permitida: o stock fica negativo e o movimento é o
-- alerta. Não toca a Gestão de Stock do Mezza.
-- Idempotente. Rollback: docs/migrations/rollback/20261221110000_pos_phase2.sql

alter table public.pos_products add column if not exists stock_qty integer not null default 0;
alter table public.pos_products add column if not exists barcode text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pos_products_barcode_ck') then
    alter table public.pos_products add constraint pos_products_barcode_ck
      check (barcode is null or barcode ~ '^[0-9A-Za-z.-]{4,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pos_products_org_id_uq') then
    alter table public.pos_products add constraint pos_products_org_id_uq unique (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pos_sales_org_id_uq') then
    alter table public.pos_sales add constraint pos_sales_org_id_uq unique (org_id, id);
  end if;
end $$;
create unique index if not exists pos_products_barcode_uq on public.pos_products (org_id, barcode) where barcode is not null;

alter table public.pos_settings add column if not exists default_view text not null default 'A';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pos_settings_default_view_ck') then
    alter table public.pos_settings add constraint pos_settings_default_view_ck check (default_view in ('A', 'B'));
  end if;
end $$;

-- Vista escolhida por cada funcionário (lembrada ao entrar com o PIN).
create table if not exists public.pos_employee_prefs (
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null,
  view text not null check (view in ('A', 'B')),
  updated_at timestamptz not null default now(),
  primary key (org_id, employee_id)
);

-- ── Movimentos de stock (append-only) ───────────────────────────────────────
create table if not exists public.pos_stock_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  product_id uuid not null,
  kind text not null check (kind in ('sale', 'refund', 'entry', 'count')),
  -- Variação do stock (venda < 0; devolução e entrada > 0; contagem calculada).
  qty integer not null,
  -- Contagem: o stock contado (o trigger calcula qty = count_to − stock_before).
  count_to integer check (count_to is null or count_to between 0 and 1000000),
  stock_before integer not null default 0,
  stock_after integer not null default 0,
  sale_id uuid,
  document_number text check (document_number is null or length(document_number) <= 60),
  actor_name text check (actor_name is null or length(actor_name) <= 200),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default clock_timestamp(),
  constraint pos_stock_moves_product_fk foreign key (org_id, product_id) references public.pos_products (org_id, id),
  constraint pos_stock_moves_sale_fk foreign key (org_id, sale_id) references public.pos_sales (org_id, id),
  constraint pos_stock_moves_kind_ck check (
    ((kind in ('sale', 'refund')) = (sale_id is not null))
    and ((kind = 'count') = (count_to is not null))
    and (kind <> 'sale' or qty < 0)
    and (kind not in ('refund', 'entry') or (qty > 0 and qty <= 100000))
  )
);
create index if not exists pos_stock_moves_org_time_idx on public.pos_stock_moves (org_id, created_at);

-- Aplica o movimento ao contador do produto (linha bloqueada: vendas em paralelo não se perdem).
create or replace function public.pos_stock_apply() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  current_qty integer;
begin
  select stock_qty into current_qty from public.pos_products
    where id = new.product_id and org_id = new.org_id for update;
  if not found then raise exception 'pos_stock: produto desconhecido'; end if;
  if new.kind = 'count' then new.qty := new.count_to - current_qty; end if;
  new.stock_before := current_qty;
  new.stock_after := current_qty + new.qty;
  update public.pos_products set stock_qty = new.stock_after where id = new.product_id;
  return new;
end $$;

drop trigger if exists pos_stock_moves_apply on public.pos_stock_moves;
create trigger pos_stock_moves_apply before insert on public.pos_stock_moves
  for each row execute function public.pos_stock_apply();
drop trigger if exists pos_stock_moves_immutable on public.pos_stock_moves;
create trigger pos_stock_moves_immutable before update or delete on public.pos_stock_moves
  for each row execute function public.invoicing_forbid_changes();
drop trigger if exists pos_stock_moves_no_truncate on public.pos_stock_moves;
create trigger pos_stock_moves_no_truncate before truncate on public.pos_stock_moves
  for each statement execute function public.invoicing_forbid_changes();

-- O contador só muda por movimentos (o trigger acima corre a profundidade ≥ 2).
create or replace function public.pos_products_guard_stock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.stock_qty is distinct from old.stock_qty and pg_trigger_depth() < 2 then
    raise exception 'pos_products.stock_qty só muda por movimentos de stock (pos_stock_moves)';
  end if;
  return new;
end $$;

drop trigger if exists pos_products_guard_stock on public.pos_products;
create trigger pos_products_guard_stock before update on public.pos_products
  for each row execute function public.pos_products_guard_stock();

-- Venda/devolução registada → movimentos dos artigos que controlam stock (mesma transação).
create or replace function public.pos_sales_stock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.pos_stock_moves (org_id, product_id, kind, qty, sale_id, document_number, actor_name)
  select new.org_id, p.id, new.kind,
         case when new.kind = 'sale' then -q.qty else q.qty end,
         new.id, new.document_number, new.employee_name
  from (
    select (l->>'productId')::uuid as product_id, sum((l->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(new.lines) as l
    group by 1
  ) q
  join public.pos_products p on p.id = q.product_id and p.org_id = new.org_id and p.track_stock
  where q.qty > 0
  order by p.id;
  return new;
end $$;

drop trigger if exists pos_sales_stock on public.pos_sales;
create trigger pos_sales_stock after insert on public.pos_sales
  for each row execute function public.pos_sales_stock();

-- ── Privilégios e RLS: escrita só pelo backend; leitura por organização ──────
revoke insert, update, delete, truncate on public.pos_stock_moves from anon, authenticated;
revoke update, delete, truncate on public.pos_stock_moves from service_role;
revoke insert, update, delete, truncate on public.pos_employee_prefs from anon, authenticated;

alter table public.pos_stock_moves enable row level security;
drop policy if exists "pos_stock_moves: org-scoped read" on public.pos_stock_moves;
create policy "pos_stock_moves: org-scoped read" on public.pos_stock_moves
  for select to authenticated using (org_id = current_org());

alter table public.pos_employee_prefs enable row level security;
drop policy if exists "pos_employee_prefs: org-scoped read" on public.pos_employee_prefs;
create policy "pos_employee_prefs: org-scoped read" on public.pos_employee_prefs
  for select to authenticated using (org_id = current_org());
