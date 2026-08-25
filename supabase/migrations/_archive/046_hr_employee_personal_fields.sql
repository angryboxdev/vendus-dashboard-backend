alter table public.hr_employees
  add column if not exists nif     text,
  add column if not exists iban    text,
  add column if not exists address text;
