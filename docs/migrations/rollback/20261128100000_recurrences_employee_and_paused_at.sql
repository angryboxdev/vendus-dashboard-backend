-- Rollback de 20261128100000_recurrences_employee_and_paused_at.sql
-- Perde-se a ligação recorrência → colaborador e a data de pausa (as recorrências e o nome
-- do beneficiário em supplier_name ficam). Fazer antes o rollback do código (a API escreve estas colunas).

drop index if exists public.idx_recurring_contracts_org_id_employee_id;

alter table public.recurring_contracts
  drop constraint if exists recurring_contracts_org_id_employee_id_fkey;

alter table public.recurring_contracts
  drop column if exists employee_id,
  drop column if exists paused_at;
