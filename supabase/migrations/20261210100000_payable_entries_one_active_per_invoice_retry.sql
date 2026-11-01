-- Fornecedores/Financeiro/Stock v1.2 · F1 §1.2 (pendência operacional, 2026-11-01): volta a tentar o índice
-- único de 20261030130000, que só era criado se o histórico não tivesse duplicados. Em 2026-11-01 não há
-- faturas com mais de uma conta a pagar ativa. Idempotente: se o índice já existe, não faz nada; se voltar
-- a haver duplicados, só avisa (nunca falha o deploy nem apaga dados).
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
