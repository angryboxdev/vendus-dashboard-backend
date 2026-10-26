-- Versões das fichas técnicas (task V5 §6.2): a partir de agora, cada alteração de uma receita de pizza
-- ou de um preparo grava uma versão com data. O custo semanal de cada pizza usa a versão em vigor
-- nessa semana; semanas anteriores à primeira versão ficam «Sem versão histórica da ficha técnica»
-- (nunca se fabrica histórico). Gravado por triggers — qualquer caminho de escrita fica coberto.
-- Uma versão por entidade e por transação (várias linhas alteradas de uma vez = uma versão).
-- Idempotente. Rollback: docs/migrations/rollback/20261118100000_recipe_versions.sql

create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('pizza', 'preparation')),
  -- pizza_id (kind = pizza) ou preparation_id (kind = preparation).
  entity_id uuid not null,
  effective_from timestamptz not null default now(),
  tx_id bigint not null default txid_current(),
  payload jsonb not null,
  constraint recipe_versions_tx_key unique (org_id, kind, entity_id, tx_id)
);

create index if not exists recipe_versions_lookup_idx on public.recipe_versions (org_id, kind, entity_id, effective_from);

alter table public.recipe_versions enable row level security;

drop policy if exists "recipe_versions: org-scoped all" on public.recipe_versions;
create policy "recipe_versions: org-scoped all"
  on public.recipe_versions
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.recipe_versions is 'Versões das fichas técnicas (pizzas e preparos), gravadas a cada alteração; base do custo semanal.';

-- Estado atual da receita ativa de uma pizza: { lines: [{ stock_item_id, preparation_id, size, quantity, waste_factor }] }.
create or replace function public.fn_recipe_version_pizza(p_org_id uuid, p_pizza_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_payload jsonb;
begin
  select jsonb_build_object('lines', coalesce(jsonb_agg(jsonb_build_object(
           'stock_item_id', i.stock_item_id,
           'preparation_id', i.preparation_id,
           'size', i.size::text,
           'quantity', i.quantity,
           'waste_factor', i.waste_factor
         ) order by i.created_at, i.id) filter (where i.id is not null), '[]'::jsonb))
    into v_payload
  from pizza_recipes r
  left join pizza_recipe_items i on i.recipe_id = r.id and i.org_id = r.org_id
  where r.org_id = p_org_id and r.pizza_id = p_pizza_id and r.is_active;

  insert into recipe_versions (org_id, kind, entity_id, payload)
  values (p_org_id, 'pizza', p_pizza_id, coalesce(v_payload, '{"lines": []}'::jsonb))
  on conflict (org_id, kind, entity_id, tx_id) do update set payload = excluded.payload;
end;
$function$;

-- Estado atual de um preparo: { yield_qty, use_as_unit, items: [{ stock_item_id, quantity }] }.
create or replace function public.fn_recipe_version_preparation(p_org_id uuid, p_preparation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
           'yield_qty', p.yield_qty,
           'use_as_unit', p.use_as_unit,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('stock_item_id', pi.stock_item_id, 'quantity', pi.quantity) order by pi.created_at, pi.id)
             from preparation_items pi
             where pi.preparation_id = p.id and pi.org_id = p.org_id
           ), '[]'::jsonb))
    into v_payload
  from preparations p
  where p.org_id = p_org_id and p.id = p_preparation_id;

  if v_payload is null then
    return; -- preparo apagado: as versões anteriores continuam a valer para o histórico
  end if;

  insert into recipe_versions (org_id, kind, entity_id, payload)
  values (p_org_id, 'preparation', p_preparation_id, v_payload)
  on conflict (org_id, kind, entity_id, tx_id) do update set payload = excluded.payload;
end;
$function$;

create or replace function public.tg_recipe_version_from_item()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_row record;
  v_pizza_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select r.pizza_id into v_pizza_id from pizza_recipes r where r.id = v_row.recipe_id and r.org_id = v_row.org_id;
  if v_pizza_id is not null then
    perform fn_recipe_version_pizza(v_row.org_id, v_pizza_id);
  end if;
  return null;
end;
$function$;

create or replace function public.tg_recipe_version_from_recipe()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_row record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  perform fn_recipe_version_pizza(v_row.org_id, v_row.pizza_id);
  return null;
end;
$function$;

create or replace function public.tg_recipe_version_from_preparation_item()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_row record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  perform fn_recipe_version_preparation(v_row.org_id, v_row.preparation_id);
  return null;
end;
$function$;

create or replace function public.tg_recipe_version_from_preparation()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
begin
  if tg_op = 'UPDATE' and new.yield_qty is not distinct from old.yield_qty and new.use_as_unit is not distinct from old.use_as_unit then
    return null; -- só nome/descrição/estado: não muda o custo
  end if;
  perform fn_recipe_version_preparation(new.org_id, new.id);
  return null;
end;
$function$;

drop trigger if exists recipe_version_on_item on public.pizza_recipe_items;
create trigger recipe_version_on_item
  after insert or update or delete on public.pizza_recipe_items
  for each row execute function public.tg_recipe_version_from_item();

drop trigger if exists recipe_version_on_recipe on public.pizza_recipes;
create trigger recipe_version_on_recipe
  after insert or update or delete on public.pizza_recipes
  for each row execute function public.tg_recipe_version_from_recipe();

drop trigger if exists recipe_version_on_preparation_item on public.preparation_items;
create trigger recipe_version_on_preparation_item
  after insert or update or delete on public.preparation_items
  for each row execute function public.tg_recipe_version_from_preparation_item();

drop trigger if exists recipe_version_on_preparation on public.preparations;
create trigger recipe_version_on_preparation
  after insert or update on public.preparations
  for each row execute function public.tg_recipe_version_from_preparation();

-- Versão inicial (a partir de agora): estado atual de todas as pizzas com receita ativa e de todos os preparos.
do $$
declare
  r record;
begin
  for r in
    select distinct pr.org_id, pr.pizza_id from pizza_recipes pr
    where pr.is_active
      and not exists (select 1 from recipe_versions v where v.org_id = pr.org_id and v.kind = 'pizza' and v.entity_id = pr.pizza_id)
  loop
    perform fn_recipe_version_pizza(r.org_id, r.pizza_id);
  end loop;
  for r in
    select p.org_id, p.id from preparations p
    where not exists (select 1 from recipe_versions v where v.org_id = p.org_id and v.kind = 'preparation' and v.entity_id = p.id)
  loop
    perform fn_recipe_version_preparation(r.org_id, r.id);
  end loop;
end $$;
