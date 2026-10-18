-- Banco de horas: idempotência dos movimentos calculados pela sincronização.
-- Os movimentos diários já tinham índice único (time_bank_daily_uq), mas os
-- ajustes de correção e as expirações não: duas sincronizações em simultâneo
-- (ex.: abrir o banco de horas em dois separadores) podiam lançar a mesma
-- correção duas vezes. A sincronização passa a gravar uma chave determinística
-- (o estado que originou o movimento); a segunda tentativa com a mesma chave
-- é recusada (23505) e ignorada. Movimentos manuais e antigos ficam com
-- sync_key nulo e não são afetados. Só objetos novos; idempotente.
-- Rollback em docs/migrations/rollback/.

alter table public.time_bank_entries add column if not exists sync_key text;

create unique index if not exists time_bank_sync_key_uq
  on public.time_bank_entries (org_id, employee_id, sync_key)
  where sync_key is not null;
