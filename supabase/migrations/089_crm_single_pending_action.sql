-- Cada cliente pode ter somente uma próxima ação pendente.
-- Caso testes anteriores tenham criado duplicados, preserva a mais próxima.

with ranked as (
  select id,
         row_number() over (
           partition by customer_id
           order by scheduled_for asc nulls last, created_at asc
         ) as position
  from public.crm_customer_actions
  where status = 'pending'
)
delete from public.crm_customer_actions as target
using ranked
where target.id = ranked.id
  and ranked.position > 1;

create unique index if not exists crm_customer_actions_one_pending_per_customer_idx
  on public.crm_customer_actions(customer_id)
  where status = 'pending';
