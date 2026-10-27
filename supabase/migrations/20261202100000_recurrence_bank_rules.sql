-- Conciliação automática de recorrências sem fatura (rendas, salários) pelos «Movimentos recorrentes».
--  * recurring_contracts.payment_period_offset: a que mês se refere o pagamento — 0 = mês do pagamento
--    (renda), -1 = mês anterior (salário de setembro pago em outubro).
--  * bank_reconciliation_rules.recurrence_id: a regra liga cada movimento à ocorrência dessa recorrência
--    (que fica paga). Sem «on delete»: as recorrências não se apagam (encerram-se); uma regra de uma
--    recorrência encerrada deixa de conciliar e o movimento fica «Por conciliar».
-- Idempotente. Rollback: docs/migrations/rollback/20261202100000_recurrence_bank_rules.sql

alter table public.recurring_contracts
  add column if not exists payment_period_offset smallint not null default 0;

alter table public.bank_reconciliation_rules
  add column if not exists recurrence_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_contracts_payment_period_offset_check') then
    alter table public.recurring_contracts
      add constraint recurring_contracts_payment_period_offset_check
      check (payment_period_offset in (-1, 0));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliation_rules_org_id_recurrence_id_fkey') then
    alter table public.bank_reconciliation_rules
      add constraint bank_reconciliation_rules_org_id_recurrence_id_fkey
      foreign key (org_id, recurrence_id) references public.recurring_contracts (org_id, id);
  end if;
end $$;

create index if not exists idx_bank_reconciliation_rules_org_id_recurrence_id
  on public.bank_reconciliation_rules (org_id, recurrence_id)
  where recurrence_id is not null;
