-- Scope get_stock_quantities_with_last_purchase to an organization (D17,
-- ADR-0008; .scratch/scoped-access/issues/17-convert-stock-services-and-jobs.md).
--
-- This function aggregated stock_movements for a set of item ids with no
-- organization predicate at all, and was executable by anonymous callers
-- (see the original definition in 20260822141653_remote_schema.sql). That is
-- a hole in this spec's own claim that the scoped query helper is the only
-- place a query is built, regardless of who wrote the function -- so it is
-- in scope here even though it predates this ticket.
--
-- The parameter list changes (p_org_id added ahead of p_item_ids), which is
-- a new overload rather than a replacement under `create or replace
-- function` -- the old uuid[]-only signature has to be dropped explicitly,
-- or the unscoped overload keeps existing and keeps being callable.
--
-- Same model as every other table the app-level boundary covers (ADR-0007):
-- org_id is filtered, not enforced by RLS, so the guarantee is that nothing
-- in src/** can call this function without supplying an organization --
-- ScopedQuery.getStockQuantitiesWithLastPurchase is the only such call site.

drop function if exists public.get_stock_quantities_with_last_purchase(uuid[]);

create or replace function public.get_stock_quantities_with_last_purchase (
  p_org_id   uuid,
  p_item_ids uuid[]
)
  returns table (
    item_id                   uuid,
    total_quantity            numeric,
    last_purchase_with_vat    numeric,
    last_purchase_without_vat numeric
  )
  language sql
  security definer
  set search_path to 'public'
  AS $function$
  with totals as (
    select sm.item_id, sum(sm.quantity) as total_quantity
    from stock_movements sm
    where sm.org_id = p_org_id
      and sm.item_id = any(p_item_ids)
    group by sm.item_id
  ),
  last_purchases as (
    select distinct on (sm.item_id)
      sm.item_id,
      sm.unit_cost_per_base_unit_with_vat    as last_purchase_with_vat,
      sm.unit_cost_per_base_unit_without_vat as last_purchase_without_vat
    from stock_movements sm
    where sm.org_id = p_org_id
      and sm.item_id = any(p_item_ids)
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
$function$;

grant execute on function public.get_stock_quantities_with_last_purchase(uuid, uuid[])
  to public, "anon", "authenticated", "postgres", "service_role";
