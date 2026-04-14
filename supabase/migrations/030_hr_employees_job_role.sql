-- Função operacional na pizzaria (select no frontend): Gerente | Preparador | Serviço.

alter table public.hr_employees
  add column if not exists job_role text not null default 'service'
    check (job_role in ('manager', 'prep', 'service'));

comment on column public.hr_employees.job_role is
  'Função: manager (Gerente), prep (Preparador), service (Serviço)';
