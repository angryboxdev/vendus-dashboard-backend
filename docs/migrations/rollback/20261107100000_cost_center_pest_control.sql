-- Rollback de 20261107100000_cost_center_pest_control.sql.
-- Apaga EST.08 só se nada a usa; se já estiver em uso fica desativada (não se perdem classificações).

update public.cost_center_categories c set is_active = false, updated_at = now()
 where c.code = 'EST.08' and c.name = 'Controlo de pragas'
   and (exists (select 1 from public.invoice_lines l where l.org_id = c.org_id and l.cost_center_category_id = c.id)
     or exists (select 1 from public.invoices i where i.org_id = c.org_id and i.cost_center_category_id = c.id)
     or exists (select 1 from public.suppliers s where s.org_id = c.org_id and s.default_cost_center_category_id = c.id)
     or exists (select 1 from public.classification_rules r where r.org_id = c.org_id and r.default_cost_center_category_id = c.id));
delete from public.cost_center_categories c
 where c.code = 'EST.08' and c.name = 'Controlo de pragas' and c.is_active;
