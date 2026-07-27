-- 067_bank_accounts.sql
-- Bancos e contas bancárias (nível acima dos extratos)

CREATE TABLE banks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  logo_key         TEXT        NOT NULL,
  color            TEXT        NOT NULL,
  country          TEXT        NOT NULL DEFAULT 'PT',
  bic              TEXT,
  statement_format TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bank_accounts (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id             UUID      NOT NULL REFERENCES banks(id),
  type                TEXT      NOT NULL CHECK (type IN ('account', 'credit_card')),
  nickname            TEXT,
  iban                TEXT,
  account_number      TEXT,
  account_type        TEXT      CHECK (account_type IN ('corrente', 'poupança', 'ordenado')),
  last_four_digits    TEXT,
  card_name           TEXT,
  credit_limit_cents  INTEGER,
  billing_cycle_day   SMALLINT  CHECK (billing_cycle_day BETWEEN 1 AND 31),
  is_active           BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bank_statement_imports
  ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);

CREATE INDEX idx_bank_accounts_bank_id
  ON bank_accounts(bank_id);

CREATE INDEX idx_bank_statement_imports_bank_account_id
  ON bank_statement_imports(bank_account_id);
