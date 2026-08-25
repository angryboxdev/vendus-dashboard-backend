-- Re-key supplier_article_mappings to use normalized description instead of article code.
-- Article codes can vary between invoices from the same supplier; descriptions are more stable.
-- supplier_article_code is kept as an informational/display field only.

-- 1. Drop the unique constraint on (supplier_normalized, supplier_article_code)
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.supplier_article_mappings'::regclass
    AND c.contype = 'u'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.conrelid
        AND a.attnum = ANY(c.conkey)
        AND a.attname = 'supplier_article_code'
    )
  LIMIT 1;
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.supplier_article_mappings DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- 2. Add normalized description column (used as the new lookup key)
alter table public.supplier_article_mappings
  add column if not exists supplier_article_description_normalized text;

-- 3. Backfill from existing descriptions
update public.supplier_article_mappings
  set supplier_article_description_normalized =
    lower(trim(regexp_replace(coalesce(supplier_article_description, ''), '\s+', ' ', 'g')))
  where supplier_article_description_normalized is null;

-- 4. Add new unique constraint on (supplier_normalized, description_normalized)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.supplier_article_mappings'::regclass
      AND conname = 'supplier_article_mappings_supplier_desc_unique'
  ) THEN
    ALTER TABLE public.supplier_article_mappings
      ADD CONSTRAINT supplier_article_mappings_supplier_desc_unique
      UNIQUE (supplier_normalized, supplier_article_description_normalized);
  END IF;
END $$;

-- 5. Replace old index
drop index if exists supplier_article_mappings_supplier_idx;
create index if not exists supplier_article_mappings_supplier_idx
  on public.supplier_article_mappings (supplier_normalized, supplier_article_description_normalized);

comment on column public.supplier_article_mappings.supplier_article_code is
  'Código do artigo na fatura (informativo — não é chave de lookup, pode variar entre faturas)';
comment on column public.supplier_article_mappings.supplier_article_description_normalized is
  'Descrição normalizada (lowercase, trim) usada como chave de lookup';
