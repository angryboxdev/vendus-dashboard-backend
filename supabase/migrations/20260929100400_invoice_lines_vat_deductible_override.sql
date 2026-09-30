-- Módulo Contabilidade — dedutibilidade de IVA por linha de fatura
-- (confirmado com o utilizador: o override de percentagem+motivo aplica-se
-- também a `invoice_lines`, não só ao novo `accounting_documents`). `null`
-- em `deductible_percentage` continua a usar a sugestão de
-- `cost_center_categories.vat_deductible` (100 ou 0) — nunca a categoria
-- decide sozinha quando o gestor diverge explicitamente.

alter table public.invoice_lines
  add column if not exists deductible_percentage integer,
  add column if not exists deductibility_override_reason text;

alter table public.invoice_lines
  drop constraint if exists invoice_lines_deductible_percentage_range;
alter table public.invoice_lines
  add constraint invoice_lines_deductible_percentage_range
    check (deductible_percentage is null or deductible_percentage between 0 and 100);

alter table public.invoice_lines
  drop constraint if exists invoice_lines_override_requires_reason;
alter table public.invoice_lines
  add constraint invoice_lines_override_requires_reason
    check (deductible_percentage is null or deductibility_override_reason is not null);

comment on column public.invoice_lines.deductible_percentage is
  'Override manual da dedutibilidade de IVA desta linha (0-100). null = usa a sugestão da subcategoria de centro de custo.';
