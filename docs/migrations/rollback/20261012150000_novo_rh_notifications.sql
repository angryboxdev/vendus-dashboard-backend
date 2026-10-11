-- Rollback de 20261012150000_novo_rh_notifications.sql
-- Notificações não são registo de auditoria; podem apagar-se. Pôr no ar antes
-- um backend sem o módulo notifications.
drop table if exists public.notifications;
