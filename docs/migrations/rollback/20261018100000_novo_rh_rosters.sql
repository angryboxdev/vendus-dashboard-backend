-- Rollback de 20261018100000_novo_rh_rosters.sql
-- O histórico de publicações é registo de auditoria: NÃO se apaga.
-- O rollback só retira a escrita (o backend anterior não usa estas tabelas).

revoke insert, update, delete on public.roster_shift_templates, public.rosters, public.roster_shifts, public.roster_publications, public.roster_swaps from authenticated;
