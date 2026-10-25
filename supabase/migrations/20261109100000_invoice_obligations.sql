-- Leitor inteligente E3b-2: obrigações (Finanças / Segurança Social) na mesma tabela das faturas,
-- com tipo próprio. Faturas existentes ficam 'purchase'. Só colunas novas. Idempotente.
alter table public.invoices
  add column if not exists document_kind text not null default 'purchase',
  add column if not exists payment_reference text null,
  add column if not exists mb_entity text null,
  add column if not exists obligation_period text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_document_kind_check') then
    alter table public.invoices
      add constraint invoices_document_kind_check check (document_kind in ('purchase', 'tax_obligation', 'contribution_obligation'));
  end if;
end $$;

-- Procura de obrigações repetidas pela referência de pagamento.
create index if not exists invoices_org_obligation_reference_idx
  on public.invoices (org_id, document_kind, payment_reference)
  where payment_reference is not null;

comment on column public.invoices.document_kind is 'purchase = fatura de compra; tax_obligation = Finanças (ex.: retenções); contribution_obligation = Segurança Social.';
comment on column public.invoices.payment_reference is 'Referência de pagamento (ao Estado, 15 dígitos, ou Multibanco).';
comment on column public.invoices.mb_entity is 'Entidade Multibanco (Segurança Social).';
comment on column public.invoices.obligation_period is 'Período da obrigação (AAAA-MM).';
