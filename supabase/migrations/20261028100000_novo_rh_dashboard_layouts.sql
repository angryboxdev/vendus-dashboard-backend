-- Novo RH → Dashboard executivo: layout pessoal (só metadados visuais —
-- ordem, tamanho e visibilidade de cada widget). Nunca guarda conteúdo,
-- números, respostas da API nem filtros de segurança; o layout não concede
-- acesso (widget sem permissão não é mostrado). Rollback em docs/migrations/rollback/.

create table if not exists public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  user_id uuid not null,
  dashboard_key text not null check (dashboard_key ~ '^[a-z0-9_.-]{1,40}$'),
  layout_version integer not null check (layout_version between 1 and 1000),
  -- [{ "widgetId": "TEAM_STATUS", "order": 0, "span": 6, "hidden": false }]
  widgets jsonb not null check (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 50),
  updated_at timestamptz not null default now(),
  constraint dashboard_layouts_org_id_uq unique (org_id, id),
  constraint dashboard_layouts_user_uq unique (org_id, user_id, dashboard_key)
);

alter table public.dashboard_layouts enable row level security;
drop policy if exists "dashboard_layouts: org-scoped all" on public.dashboard_layouts;
create policy "dashboard_layouts: org-scoped all" on public.dashboard_layouts for all to authenticated using (org_id = current_org()) with check (org_id = current_org());
