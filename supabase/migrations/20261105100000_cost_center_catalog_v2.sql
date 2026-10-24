-- Catálogo de Categorias v2 (leitor inteligente E2, .scratch/leitor-faturas/spec.md).
-- Evolui o catálogo predefinido sem reclassificar faturas: IDs mantêm-se, só
-- nomes, um movimento de grupo, duas subcategorias novas e a política de Stock.
-- Só toca linhas com o código/nome predefinido (personalizações ficam como estão).
-- Idempotente: reexecutar não muda nada.

-- 1. Nomes
update public.cost_center_categories set name = 'Ingredientes', updated_at = now()
 where code = 'OPD.01' and name = 'CMV / Ingredientes';
update public.cost_center_categories set name = 'Embalagens e descartáveis', updated_at = now()
 where code = 'OPD.03' and name = 'Embalagens';
update public.cost_center_categories set name = 'Adiantamentos, depósitos e cauções', updated_at = now()
 where code = 'FDR.05' and name = 'Adiantamentos / Cauções';

-- 2. Limpeza & Higiene passa de Estrutura (custo fixo) para Operação Direta (custo variável).
update public.cost_center_categories c
   set group_id = g.id, code = 'OPD.08', financial_type = 'variable_cost', affects_profitability = true, updated_at = now()
  from public.cost_center_groups g
 where g.org_id = c.org_id and g.code = 'OPD'
   and c.code = 'EST.05' and c.name = 'Limpeza & Higiene'
   and not exists (select 1 from public.cost_center_categories x where x.org_id = c.org_id and x.code = 'OPD.08');

-- 3. Subcategorias novas (só em organizações que já têm o catálogo predefinido).
insert into public.cost_center_categories
  (org_id, group_id, code, name, financial_type, affects_dre, affects_cashflow, affects_profitability, requires_channel, requires_allocation, stock_review_policy, description)
select g.org_id, g.id, 'OPD.09', 'Consumíveis operacionais', 'variable_cost', true, true, true, false, false, 'NO_STOCK_EFFECT',
       'Pilhas, etiquetas, gás de maçarico e outros consumíveis da operação que não são ingredientes nem embalagens.'
  from public.cost_center_groups g
 where g.code = 'OPD'
on conflict (org_id, code) do nothing;

insert into public.cost_center_categories
  (org_id, group_id, code, name, financial_type, affects_dre, affects_cashflow, affects_profitability, requires_channel, requires_allocation, stock_review_policy, description)
select g.org_id, g.id, 'EST.07', 'Utensílios e pequeno equipamento', 'fixed_opex', true, true, false, false, false, 'NO_STOCK_EFFECT',
       'Utensílios e pequeno equipamento levados a gasto (não investimento). O limite face a Equipamentos (CAPEX) deve ser validado pela contabilidade.'
  from public.cost_center_groups g
 where g.code = 'EST'
on conflict (org_id, code) do nothing;

-- 4. Política de Stock por omissão — só onde ainda está por definir (configuração manual prevalece).
update public.cost_center_categories set stock_review_policy = 'CREATE_REVIEW', updated_at = now()
 where code in ('OPD.01', 'OPD.02') and stock_review_policy = 'UNDEFINED';
update public.cost_center_categories set stock_review_policy = 'NO_STOCK_EFFECT', updated_at = now()
 where stock_review_policy = 'UNDEFINED'
   and code in ('OPD.04', 'OPD.05', 'OPD.06', 'OPD.07',
                'PES.01', 'PES.02', 'PES.03', 'PES.04',
                'EST.01', 'EST.02', 'EST.03', 'EST.04', 'EST.06',
                'ADM.01', 'ADM.02', 'ADM.03', 'ADM.04', 'ADM.05', 'ADM.06',
                'MKT.01', 'MKT.02', 'MKT.03', 'MKT.04', 'MKT.05',
                'CAP.01', 'CAP.02', 'CAP.03', 'CAP.04',
                'FDR.01', 'FDR.02', 'FDR.03', 'FDR.04', 'FDR.05');
-- OPD.03 (Embalagens e descartáveis) e OPD.08 (Limpeza & Higiene) ficam UNDEFINED: decide o fornecedor/documento.
