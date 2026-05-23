-- CRM Module · Angry Box
-- Tabelas base: clientes, pedidos, contactos, scripts, tags, parâmetros

-- ─── Clientes ──────────────────────────────────────────────────────────────────
create table public.crm_customers (
  id                 text primary key,           -- C001, C002, ...
  first_name         text not null,
  last_name          text,
  email              text,
  phone              text,
  preferred_channel  text not null default 'WhatsApp'
                       check (preferred_channel in ('WhatsApp','Email','SMS')),
  birthday           date,
  how_found          text
                       check (how_found in ('Indicação','Redes Sociais','Walk-in','Passagem','Outro')),
  opt_in             text not null default 'Pendente'
                       check (opt_in in ('Pendente','Sim','Não')),
  notes              text,
  inactive           boolean not null default false,  -- Inativo Definitivo
  referred_by        text references public.crm_customers(id),
  seg07_path         text check (seg07_path in ('A','B')),  -- Caminho SEG-07 (manual)
  registered_at      date not null default current_date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── Pedidos ───────────────────────────────────────────────────────────────────
create table public.crm_orders (
  id           uuid primary key default gen_random_uuid(),
  customer_id  text not null references public.crm_customers(id) on delete cascade,
  order_date   date not null,
  total_value  numeric(10,2) not null check (total_value >= 0),
  status       text not null default 'concluído'
                 check (status in ('concluído','cancelado')),
  notes        text,
  created_at   timestamptz not null default now()
);

create index crm_orders_customer_id_idx on public.crm_orders(customer_id);
create index crm_orders_order_date_idx  on public.crm_orders(order_date);

-- ─── Scripts ───────────────────────────────────────────────────────────────────
create table public.crm_scripts (
  code            text primary key,        -- ex: '2.1.1', 'CEN-05'
  name            text not null,
  segment         text,                    -- 'SEG-01', 'SEG-04', 'global', etc.
  body            text not null,           -- texto principal (WhatsApp)
  variants        jsonb,                   -- [{label, body}] para A/B/C ou canal alternativo
  channel         text,                    -- canal sugerido
  trigger_timing  text,                    -- descrição do timing
  one_shot        boolean not null default false,
  cooldown_days   integer,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Tags ──────────────────────────────────────────────────────────────────────
create table public.crm_tags (
  name        text primary key,
  description text,
  color       text not null default '#6b7280',
  category    text not null default 'geral'
                check (category in ('feedback','comportamento','alerta','estado','geral'))
);

-- ─── Relação cliente ↔ tag ─────────────────────────────────────────────────────
create table public.crm_customer_tags (
  customer_id  text not null references public.crm_customers(id) on delete cascade,
  tag_name     text not null references public.crm_tags(name) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (customer_id, tag_name)
);

create index crm_customer_tags_customer_idx on public.crm_customer_tags(customer_id);

-- ─── Contactos (log) ───────────────────────────────────────────────────────────
create table public.crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  customer_id      text not null references public.crm_customers(id) on delete cascade,
  contacted_at     timestamptz not null,
  channel          text check (channel in ('WhatsApp','Email','SMS')),
  script_code      text,                   -- '2.1.1', 'free', etc.
  direction        text not null default 'Enviado'
                     check (direction in ('Enviado','Recebido')),
  status           text check (status in ('Enviado','Entregue','Lido','Respondeu','Sem resposta','Não Respondeu')),
  response         text check (response in ('Positivo','Neutro','Negativo','Sem Resposta')),
  notes            text,
  segment_at_time  text,                   -- segmento do cliente no momento do contacto
  created_at       timestamptz not null default now()
);

create index crm_contacts_customer_id_idx   on public.crm_contacts(customer_id);
create index crm_contacts_contacted_at_idx  on public.crm_contacts(contacted_at);
create index crm_contacts_script_code_idx   on public.crm_contacts(script_code);

-- ─── Parâmetros configuráveis ──────────────────────────────────────────────────
create table public.crm_parameters (
  key         text primary key,
  value       text not null,
  description text,
  category    text not null default 'geral',
  updated_at  timestamptz not null default now()
);
