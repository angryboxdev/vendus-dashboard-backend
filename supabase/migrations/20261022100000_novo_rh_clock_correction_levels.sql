-- Novo RH (FE-113): fluxos de aprovação também para os pedidos de correção de ponto.
-- Níveis e aprovadores fixados na criação do pedido (como nas ausências, ADR-0028).
-- Sem fluxo de ponto configurado, levels fica [] e decide quem gere a assiduidade (como antes).
alter table public.clock_correction_requests
  add column if not exists levels jsonb not null default '[]'::jsonb,
  add column if not exists current_level integer not null default 0;

alter table public.clock_correction_requests drop constraint if exists clock_correction_requests_current_level_ck;
alter table public.clock_correction_requests
  add constraint clock_correction_requests_current_level_ck check (current_level >= 0 and jsonb_typeof(levels) = 'array');
