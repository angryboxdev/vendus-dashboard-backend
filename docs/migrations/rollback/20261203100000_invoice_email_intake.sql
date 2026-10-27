-- Rollback de 20261203100000_invoice_email_intake.sql
-- Apaga as tabelas das Faturas por email (endereços, definições, eventos, anexos) e a origem nas faturas.
-- As faturas criadas por email ficam (são rascunhos/faturas normais); perde-se só a marca «Email» e o
-- histórico das receções. Fazer antes o rollback do código (a API escreve estas tabelas) e desligar o
-- webhook na Resend.

drop function if exists public.fn_rotate_invoice_inbound_address(uuid, text, text, text);

alter table public.invoices
  drop constraint if exists invoices_intake_source_check;
alter table public.invoices
  drop column if exists intake_source;

drop table if exists public.invoice_inbound_attachments;
drop table if exists public.inbound_email_events;
drop table if exists public.invoice_email_intake_settings;
drop table if exists public.invoice_inbound_addresses;
