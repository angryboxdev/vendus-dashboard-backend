-- Leitor inteligente E3 (.scratch/leitor-faturas/spec.md): guardar o que o leitor
-- determinístico leu, para auditoria e para aprender com faturas confirmadas.
-- Só colunas novas e opcionais; dados existentes ficam como estão. Idempotente.

-- Linhas: código do artigo do fornecedor (texto: zeros à esquerda preservados) e
-- metadados da leitura (página, ordem, tipo artigo/depósito, código de IVA, promoção,
-- ligação depósito → artigo, notas IEC, origem/evidência da categoria sugerida).
alter table public.invoice_lines
  add column if not exists supplier_item_code text null,
  add column if not exists reading_meta jsonb null;

create index if not exists invoice_lines_org_supplier_item_code_idx
  on public.invoice_lines (org_id, supplier_item_code)
  where supplier_item_code is not null;

-- Fatura: campos do QR fiscal AT (evidência; acesso pelo RLS da própria tabela) e
-- de onde vieram os dados (leitor determinístico ou IA).
alter table public.invoices
  add column if not exists fiscal_qr jsonb null,
  add column if not exists reading_source text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_reading_source_check') then
    alter table public.invoices
      add constraint invoices_reading_source_check check (reading_source is null or reading_source in ('deterministic', 'ai'));
  end if;
end $$;

comment on column public.invoice_lines.supplier_item_code is 'Código do artigo no documento do fornecedor (texto). Usado para sugerir a categoria a partir de faturas confirmadas.';
comment on column public.invoice_lines.reading_meta is 'Metadados do leitor determinístico (página, ordem, tipo, código de IVA, promoção, depósito→artigo, notas, origem da categoria sugerida).';
comment on column public.invoices.fiscal_qr is 'Campos do QR fiscal AT lidos localmente (evidência).';
comment on column public.invoices.reading_source is 'deterministic = QR + texto do PDF; ai = extração por IA.';
