-- Recorrências de salários e histórico:
--  * recurring_contracts.employee_id: colaborador (ficha partilhada hr_employees) a quem se paga
--    a recorrência — escolhido no formulário quando a categoria é «Salários».
--  * recurring_contracts.paused_at: data em que a recorrência foi pausada (vista «Histórico»);
--    limpa ao retomar. As pausadas antes desta migração ficam sem data.
-- Idempotente. Rollback: docs/migrations/rollback/20261128100000_recurrences_employee_and_paused_at.sql

alter table public.recurring_contracts
  add column if not exists employee_id uuid,
  add column if not exists paused_at date;

do $$
begin
  -- Apagar a ficha do colaborador não apaga a recorrência: só desliga o colaborador.
  if not exists (select 1 from pg_constraint where conname = 'recurring_contracts_org_id_employee_id_fkey') then
    alter table public.recurring_contracts
      add constraint recurring_contracts_org_id_employee_id_fkey
      foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
      on delete set null (employee_id);
  end if;
end $$;

create index if not exists idx_recurring_contracts_org_id_employee_id
  on public.recurring_contracts (org_id, employee_id)
  where employee_id is not null;
