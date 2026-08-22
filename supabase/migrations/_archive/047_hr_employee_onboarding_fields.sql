alter table public.hr_employees
  add column if not exists birth_date               date,
  add column if not exists social_security_number   text,
  add column if not exists id_card_number           text,
  add column if not exists nationality              text,
  add column if not exists emergency_contact_name   text,
  add column if not exists emergency_contact_phone  text;
