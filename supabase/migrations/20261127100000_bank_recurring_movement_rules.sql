-- «Movimentos recorrentes»: regras de conciliação automática criadas a partir de um movimento
-- (taxas TPA, despesas bancárias e outros movimentos sem fatura que se repetem todos os meses).
--  * bank_reconciliation_rules: conta de origem, valor fixo opcional (± margem), fornecedor e IVA.
--  * bank_movements.classified_by_rule_id: que regra conciliou o movimento (selo «Automático», anular).
-- Idempotente. Rollback: docs/migrations/rollback/20261127100000_bank_recurring_movement_rules.sql

alter table public.bank_reconciliation_rules
  add column if not exists bank_account_id uuid,
  add column if not exists amount_cents bigint,
  add column if not exists amount_tolerance_cents integer not null default 100,
  add column if not exists supplier_id uuid,
  add column if not exists vat_rate numeric,
  add column if not exists vat_included boolean;

alter table public.bank_movements
  add column if not exists classified_by_rule_id uuid;

-- Chave (org_id, id) nas regras, para a FK composta dos movimentos (convenção multi-organização).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliation_rules_org_id_id_key') then
    alter table public.bank_reconciliation_rules
      add constraint bank_reconciliation_rules_org_id_id_key unique (org_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliation_rules_org_id_bank_account_id_fkey') then
    alter table public.bank_reconciliation_rules
      add constraint bank_reconciliation_rules_org_id_bank_account_id_fkey
      foreign key (org_id, bank_account_id) references public.bank_accounts (org_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliation_rules_org_id_supplier_id_fkey') then
    alter table public.bank_reconciliation_rules
      add constraint bank_reconciliation_rules_org_id_supplier_id_fkey
      foreign key (org_id, supplier_id) references public.suppliers (org_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliation_rules_amount_check') then
    alter table public.bank_reconciliation_rules
      add constraint bank_reconciliation_rules_amount_check
      check ((amount_cents is null or amount_cents >= 0) and amount_tolerance_cents >= 0);
  end if;

  -- Sem «on delete»: ao apagar uma regra, a aplicação desliga primeiro os movimentos (a classificação fica).
  if not exists (select 1 from pg_constraint where conname = 'bank_movements_org_id_classified_by_rule_id_fkey') then
    alter table public.bank_movements
      add constraint bank_movements_org_id_classified_by_rule_id_fkey
      foreign key (org_id, classified_by_rule_id) references public.bank_reconciliation_rules (org_id, id);
  end if;
end $$;

create index if not exists idx_bank_movements_org_id_classified_by_rule_id
  on public.bank_movements (org_id, classified_by_rule_id)
  where classified_by_rule_id is not null;

create index if not exists idx_bank_reconciliation_rules_org_id_bank_account_id
  on public.bank_reconciliation_rules (org_id, bank_account_id);
