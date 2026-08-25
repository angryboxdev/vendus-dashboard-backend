-- Convert supplier_article_description_normalized from text to text[].
-- One row per (supplier, stock_item); descriptions grow as new invoices are confirmed.
-- Lookup: any description in the array triggers a match.

-- 1. Drop old unique constraint on (supplier_normalized, description text)
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.supplier_article_mappings'::regclass
    AND contype = 'u'
    AND conname = 'supplier_article_mappings_supplier_desc_unique';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.supplier_article_mappings DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- 2. Convert column from text → text[] (wrap existing value in a single-element array)
ALTER TABLE public.supplier_article_mappings
  ALTER COLUMN supplier_article_description_normalized TYPE text[]
  USING CASE
    WHEN supplier_article_description_normalized IS NULL THEN ARRAY[]::text[]
    ELSE ARRAY[supplier_article_description_normalized]
  END;

-- 3. New unique constraint: one row per (supplier, stock_item)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.supplier_article_mappings'::regclass
      AND conname = 'supplier_article_mappings_supplier_item_unique'
  ) THEN
    ALTER TABLE public.supplier_article_mappings
      ADD CONSTRAINT supplier_article_mappings_supplier_item_unique
      UNIQUE (supplier_normalized, stock_item_id);
  END IF;
END $$;

-- 4. Replace index (GIN is efficient for array-contains queries)
DROP INDEX IF EXISTS supplier_article_mappings_supplier_idx;
CREATE INDEX IF NOT EXISTS supplier_article_mappings_descriptions_idx
  ON public.supplier_article_mappings USING GIN (supplier_article_description_normalized);
CREATE INDEX IF NOT EXISTS supplier_article_mappings_supplier_item_idx
  ON public.supplier_article_mappings (supplier_normalized, stock_item_id);

COMMENT ON COLUMN public.supplier_article_mappings.supplier_article_description_normalized IS
  'Array de descrições normalizadas conhecidas para este artigo/fornecedor. Cresce a cada fatura confirmada.';
