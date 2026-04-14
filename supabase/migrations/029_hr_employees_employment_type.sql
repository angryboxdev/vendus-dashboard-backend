-- Tipo de vínculo laboral (alinhado com frontend: permanent | contract | extra).

alter table public.hr_employees
  add column if not exists employment_type text not null default 'permanent'
    check (employment_type in ('permanent', 'contract', 'extra'));

comment on column public.hr_employees.employment_type is
  'Efetivo (permanent), Contrato a termo (contract), Extra (extra)';
