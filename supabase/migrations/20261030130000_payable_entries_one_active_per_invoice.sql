-- Fornecedores/Financeiro/Stock v1.2 · F1 §1.2: uma obrigação financeira ativa por documento.
-- Só cria o índice único se o histórico não tiver duplicados (nunca falha o deploy nem apaga dados);
-- havendo duplicados, ficam no relatório GET /api/invoices/integrity/payable-duplicates para revisão
-- e este bloco volta a correr (idempotente) depois de resolvidos — ver docs/migrations/financeiro-f1.md.
do $$
declare dup int;
begin
  select count(*) into dup from (
    select org_id, invoice_id from public.payable_entries
    where invoice_id is not null and status <> 'cancelled'
    group by org_id, invoice_id having count(*) > 1
  ) d;
  if dup = 0 then
    create unique index if not exists payable_entries_one_active_per_invoice
      on public.payable_entries (org_id, invoice_id)
      where invoice_id is not null and status <> 'cancelled';
  else
    raise notice 'payable_entries_one_active_per_invoice NÃO criado: % fatura(s) com mais de uma conta a pagar ativa (ver relatório)', dup;
  end if;
end $$;
