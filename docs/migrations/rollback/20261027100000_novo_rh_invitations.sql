-- Rollback de 20261027100000_novo_rh_invitations.sql
-- Atenção: apaga os convites e os pedidos de adesão (incluindo os pendentes).
drop table if exists public.join_requests;
drop table if exists public.invitations;
