-- Migration 081: Remove manual payable entries
--
-- O conceito de "pagamento manual" (sem fatura nem recorrência) foi removido.
-- Qualquer despesa sem fatura é gerida como recorrência (payable-recurrences).
-- Esta migration elimina todos os registos com source='manual' e ajusta
-- a constraint e o default para que o valor 'manual' deixe de ser aceite.

-- 1. Apagar registos manuais
DELETE FROM payable_entries WHERE source = 'manual';

-- 2. Remover 'manual' do CHECK e ajustar DEFAULT
ALTER TABLE payable_entries
  DROP CONSTRAINT IF EXISTS payable_entries_source_check;

ALTER TABLE payable_entries
  ADD CONSTRAINT payable_entries_source_check
    CHECK (source IN ('invoice', 'recurrence'));

ALTER TABLE payable_entries
  ALTER COLUMN source SET DEFAULT 'invoice';
