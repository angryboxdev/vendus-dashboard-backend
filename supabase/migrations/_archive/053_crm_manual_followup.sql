-- CRM · data manual de follow-up por cliente
alter table public.crm_customers
  add column if not exists manual_followup_date date;
