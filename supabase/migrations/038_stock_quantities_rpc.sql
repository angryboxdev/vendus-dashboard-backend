/**
 * RPC: get_stock_quantities_with_last_purchase
 *
 * Agrega os movimentos de stock no servidor (PostgreSQL), devolvendo
 * uma linha por item — evita o limite de linhas do PostgREST (max_rows).
 *
 * Retorna:
 *   item_id                          uuid
 *   total_quantity                   numeric  – SUM(quantity) de todos os movimentos
 *   last_purchase_with_vat           numeric  – custo c/ IVA da última compra com custo preenchido
 *   last_purchase_without_vat        numeric  – custo s/ IVA da mesma linha
 */
create or replace function public.get_stock_quantities_with_last_purchase(
  p_item_ids uuid[]
)
returns table(
  item_id                   uuid,
  total_quantity            numeric,
  last_purchase_with_vat    numeric,
  last_purchase_without_vat numeric
)
language sql
security definer
set search_path = public
as $$
  with totals as (
    select sm.item_id, sum(sm.quantity) as total_quantity
    from stock_movements sm
    where sm.item_id = any(p_item_ids)
    group by sm.item_id
  ),
  last_purchases as (
    select distinct on (sm.item_id)
      sm.item_id,
      sm.unit_cost_per_base_unit_with_vat    as last_purchase_with_vat,
      sm.unit_cost_per_base_unit_without_vat as last_purchase_without_vat
    from stock_movements sm
    where sm.item_id = any(p_item_ids)
      and sm.type = 'purchase'
      and sm.quantity > 0
      and (
        sm.unit_cost_per_base_unit_with_vat    is not null
        or sm.unit_cost_per_base_unit_without_vat is not null
      )
    order by sm.item_id, sm.movement_date desc, sm.created_at desc
  )
  select
    t.item_id,
    coalesce(t.total_quantity, 0)                     as total_quantity,
    lp.last_purchase_with_vat,
    lp.last_purchase_without_vat
  from totals t
  left join last_purchases lp on lp.item_id = t.item_id;
$$;

-- Índices para performance do RPC e queries de stock em geral
create index if not exists stock_movements_item_id_idx
  on public.stock_movements(item_id);

create index if not exists stock_movements_item_purchase_idx
  on public.stock_movements(item_id, movement_date desc, created_at desc)
  where type = 'purchase';
