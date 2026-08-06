-- Canais de venda da Angry Box Hub
-- Representa a origem da venda (onde o pedido foi feito), não o método de pagamento.
-- Ortogonal ao conceito de tpa/cashSales do módulo cash-closings.

CREATE TABLE IF NOT EXISTS channels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed dos 7 canais (deterministic IDs: 80000000-...)
INSERT INTO channels (id, code, name, sort_order) VALUES
  ('80000000-0000-0000-0000-000000000001', 'SALON',    'Salão',      1),
  ('80000000-0000-0000-0000-000000000002', 'TAKEAWAY', 'Take Away',  2),
  ('80000000-0000-0000-0000-000000000003', 'EATZ',     'Eatz',       3),
  ('80000000-0000-0000-0000-000000000004', 'UBER_EATS','Uber Eats',  4),
  ('80000000-0000-0000-0000-000000000005', 'GLOVO',    'Glovo',      5),
  ('80000000-0000-0000-0000-000000000006', 'BOLT',     'Bolt',       6),
  ('80000000-0000-0000-0000-000000000007', 'INTERNAL', 'Autoconsumo',7)
ON CONFLICT (code) DO NOTHING;

-- RLS (consistente com o padrão das outras tabelas)
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon channels"
  ON channels FOR ALL USING (true) WITH CHECK (true);
