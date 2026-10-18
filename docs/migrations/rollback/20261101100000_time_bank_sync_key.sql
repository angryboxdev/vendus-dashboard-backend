-- Rollback de 20261101100000_time_bank_sync_key.sql (volta a não haver proteção
-- contra correções/expirações duplicadas por sincronizações simultâneas).
-- O backend que grava sync_key tem de ser revertido antes.
drop index if exists public.time_bank_sync_key_uq;
alter table public.time_bank_entries drop column if exists sync_key;
