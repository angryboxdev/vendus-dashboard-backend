-- Financeiro/Stock v1.2 — F3b: conciliação proposta por linha de Compras por rever.
-- Histórico do fornecedor → nome igual no catálogo → IA; gravada para não repetir a IA a cada
-- abertura. Nunca resolve a linha (só sugestão). Só colunas novas. Idempotente.

alter table public.stock_review_lines
  add column if not exists suggestion_source text null,
  add column if not exists suggested_resolution text null,
  add column if not exists suggested_stock_item_id uuid null references public.stock_items(id),
  add column if not exists suggested_conversion_factor numeric(18,6) null,
  add column if not exists suggestion_confidence numeric(5,4) null,
  add column if not exists suggestion_packaging_changed boolean not null default false,
  add column if not exists suggested_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_review_lines_suggestion_check') then
    alter table public.stock_review_lines
      add constraint stock_review_lines_suggestion_check check (
        (suggestion_source is null or suggestion_source in ('learned', 'name_match', 'ai', 'none'))
        and (suggested_resolution is null or suggested_resolution in ('existing_item', 'no_stock_effect'))
        and (suggested_conversion_factor is null or suggested_conversion_factor > 0)
      );
  end if;
end $$;

comment on column public.stock_review_lines.suggestion_source is 'Origem da conciliação proposta: learned (histórico do fornecedor), name_match (nome no catálogo), ai, none (procurado sem resultado). Só sugestão.';
