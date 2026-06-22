-- Migrate cost centers to two-level hierarchy:
-- cost_center_groups (7 groups) + cost_center_categories (28 subcategories)
--
-- Replaces the old flat cost_centers table.
-- Suppliers gain defaultCostCenterGroupId + defaultCostCenterCategoryId.

-- ─── New tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_center_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_center_categories (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid        NOT NULL REFERENCES cost_center_groups(id),
  code                  text        NOT NULL UNIQUE,
  name                  text        NOT NULL,
  financial_type        text        NOT NULL,
  affects_dre           boolean     NOT NULL DEFAULT false,
  affects_cashflow      boolean     NOT NULL DEFAULT false,
  affects_profitability boolean     NOT NULL DEFAULT false,
  requires_channel      boolean     NOT NULL DEFAULT false,
  requires_allocation   boolean     NOT NULL DEFAULT false,
  is_active             boolean     NOT NULL DEFAULT true,
  description           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── Update suppliers ────────────────────────────────────────────────────────

ALTER TABLE suppliers
  DROP COLUMN IF EXISTS default_cost_center_id,
  ADD COLUMN IF NOT EXISTS default_cost_center_group_id    uuid REFERENCES cost_center_groups(id),
  ADD COLUMN IF NOT EXISTS default_cost_center_category_id uuid REFERENCES cost_center_categories(id);

-- ─── Drop old flat table (safe: no FK constraints point to it after migration)
-- Only drop if it exists and is safe to drop in your environment.
-- Run manually if needed: DROP TABLE IF EXISTS cost_centers;
