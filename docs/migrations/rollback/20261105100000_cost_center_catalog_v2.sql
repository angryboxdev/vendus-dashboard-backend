-- Rollback de 20261105100000_cost_center_catalog_v2.sql (ordem inversa).
-- Antes da migração todas as subcategorias tinham stock_review_policy = 'UNDEFINED'
-- (verificado em produção a 2026-10-24); repõe-se só o que a migração definiu.

-- 4. Política de Stock
update public.cost_center_categories set stock_review_policy = 'UNDEFINED', updated_at = now()
 where (code in ('OPD.01', 'OPD.02') and stock_review_policy = 'CREATE_REVIEW')
    or (stock_review_policy = 'NO_STOCK_EFFECT'
        and code in ('OPD.04', 'OPD.05', 'OPD.06', 'OPD.07',
                     'PES.01', 'PES.02', 'PES.03', 'PES.04',
                     'EST.01', 'EST.02', 'EST.03', 'EST.04', 'EST.06',
                     'ADM.01', 'ADM.02', 'ADM.03', 'ADM.04', 'ADM.05', 'ADM.06',
                     'MKT.01', 'MKT.02', 'MKT.03', 'MKT.04', 'MKT.05',
                     'CAP.01', 'CAP.02', 'CAP.03', 'CAP.04',
                     'FDR.01', 'FDR.02', 'FDR.03', 'FDR.04', 'FDR.05'));

-- 3. Subcategorias novas: apagar só se nada as usa; se já estiverem em uso ficam (desativadas).
update public.cost_center_categories c set is_active = false, updated_at = now()
 where c.code in ('OPD.09', 'EST.07')
   and (exists (select 1 from public.invoice_lines l where l.org_id = c.org_id and l.cost_center_category_id = c.id)
     or exists (select 1 from public.invoices i where i.org_id = c.org_id and i.cost_center_category_id = c.id)
     or exists (select 1 from public.suppliers s where s.org_id = c.org_id and s.default_cost_center_category_id = c.id)
     or exists (select 1 from public.classification_rules r where r.org_id = c.org_id and r.default_cost_center_category_id = c.id));
delete from public.cost_center_categories c
 where c.code in ('OPD.09', 'EST.07') and c.is_active;

-- 2. Limpeza & Higiene volta a Estrutura (custo fixo).
update public.cost_center_categories c
   set group_id = g.id, code = 'EST.05', financial_type = 'fixed_opex', affects_profitability = false, updated_at = now()
  from public.cost_center_groups g
 where g.org_id = c.org_id and g.code = 'EST'
   and c.code = 'OPD.08' and c.name = 'Limpeza & Higiene'
   and not exists (select 1 from public.cost_center_categories x where x.org_id = c.org_id and x.code = 'EST.05');

-- 1. Nomes
update public.cost_center_categories set name = 'CMV / Ingredientes', updated_at = now()
 where code = 'OPD.01' and name = 'Ingredientes';
update public.cost_center_categories set name = 'Embalagens', updated_at = now()
 where code = 'OPD.03' and name = 'Embalagens e descartáveis';
update public.cost_center_categories set name = 'Adiantamentos / Cauções', updated_at = now()
 where code = 'FDR.05' and name = 'Adiantamentos, depósitos e cauções';
