-- Subcategoria «Controlo de pragas» (EST.08) em Estrutura & Instalações — aprovada pelo
-- utilizador (2026-10-24, caso CPF/2530). Só acrescenta; não reclassifica nada.
-- Idempotente: só em organizações com o grupo EST e sem EST.08.

insert into public.cost_center_categories
  (org_id, group_id, code, name, financial_type, affects_dre, affects_cashflow, affects_profitability, requires_channel, requires_allocation, stock_review_policy, description)
select g.org_id, g.id, 'EST.08', 'Controlo de pragas', 'fixed_opex', true, true, false, false, false, 'NO_STOCK_EFFECT',
       'Desratização, desbaratização, desinfestação e manutenção de insetocaçadores (serviço externo, não afeta o Stock).'
  from public.cost_center_groups g
 where g.code = 'EST'
on conflict (org_id, code) do nothing;
