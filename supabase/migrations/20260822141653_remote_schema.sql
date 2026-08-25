set local check_function_bodies = off;

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "service_role";

create table "public"."analytics_monthly_cache" (
  "year"            smallint                 not null,
  "month"           smallint                 not null,
  "gross_cents"     bigint                   not null,
  "documents_count" integer                  not null,
  "computed_at"     timestamp with time zone not null default now(),
  constraint "analytics_monthly_cache_pkey" primary key (year, month)
);

alter table "public"."analytics_monthly_cache"
  enable row level security;

create table "public"."app_users" (
  "id"         uuid                     not null,
  "email"      text                     not null,
  "role"       text                     not null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "app_users_pkey" primary key (id),
  constraint "app_users_role_check" check ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'hr_viewer'::text])))
);

alter table "public"."app_users"
  enable row level security;

create table "public"."bank_accounts" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "bank_id"            uuid                     not null,
  "type"               text                     not null,
  "nickname"           text,
  "iban"               text,
  "account_number"     text,
  "account_type"       text,
  "last_four_digits"   text,
  "card_name"          text,
  "credit_limit_cents" integer,
  "billing_cycle_day"  smallint,
  "is_active"          boolean                  not null default true,
  "created_at"         timestamp with time zone not null default now(),
  "updated_at"         timestamp with time zone not null default now(),
  constraint "bank_accounts_account_type_check" check ((account_type = ANY (ARRAY['corrente'::text, 'poupança'::text, 'ordenado'::text]))),
  constraint "bank_accounts_billing_cycle_day_check" check (((billing_cycle_day >= 1) AND (billing_cycle_day <= 31))),
  constraint "bank_accounts_pkey" primary key (id),
  constraint "bank_accounts_type_check" check ((type = ANY (ARRAY['account'::text, 'credit_card'::text])))
);

alter table "public"."bank_accounts"
  enable row level security;

create table "public"."bank_movement_entity_links" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "movement_id"            uuid                     not null,
  "entity_type"            text                     not null,
  "entity_id"              uuid                     not null,
  "amount_cents"           integer                  not null,
  "entity_label"           text                     not null,
  "created_at"             timestamp with time zone not null default now(),
  "allocated_amount_cents" integer                  not null default 0,
  constraint "bank_movement_entity_links_entity_type_check" check ((entity_type = ANY (ARRAY['invoice'::text, 'payable_entry'::text]))),
  constraint "bank_movement_entity_links_movement_id_entity_id_key" unique (movement_id, entity_id),
  constraint "bank_movement_entity_links_pkey" primary key (id)
);

alter table "public"."bank_movement_entity_links"
  enable row level security;

create table "public"."bank_movement_match_hints" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "normalized_description" text                     not null,
  "supplier_id"            uuid                     not null,
  "use_count"              integer                  not null default 1,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  constraint "bank_movement_match_hints_normalized_description_supplier_i_key" unique (normalized_description, supplier_id),
  constraint "bank_movement_match_hints_pkey" primary key (id)
);

alter table "public"."bank_movement_match_hints"
  enable row level security;

create table "public"."bank_movements" (
  "id"                         uuid                     not null default gen_random_uuid(),
  "statement_import_id"        uuid                     not null,
  "booking_date"               date                     not null,
  "value_date"                 date                     not null,
  "description"                text                     not null,
  "amount"                     integer                  not null,
  "balance_after"              integer                  not null,
  "currency"                   text                     not null default 'EUR'::text,
  "movement_type"              text                     not null,
  "reconciliation_status"      text                     not null default 'saida_nao_justificada'::text,
  "justification_type"         text,
  "risk_level"                 text                     not null default 'medium'::text,
  "requires_document"          boolean                  not null default true,
  "document_url"               text,
  "matched_entity_type"        text,
  "matched_entity_id"          uuid,
  "confidence_score"           numeric(3,2),
  "notes"                      text,
  "deduplication_hash"         text                     not null,
  "created_at"                 timestamp with time zone not null default now(),
  "updated_at"                 timestamp with time zone not null default now(),
  "cost_center_group_id"       uuid,
  "cost_center_category_id"    uuid,
  "supplier_id"                uuid,
  "vat_rate"                   numeric(5,2),
  "vat_included"               boolean,
  "reconciliation_amount_diff" integer,
  "bank_account_id"            uuid,
  constraint "bank_movements_confidence_score_check" check (((confidence_score IS NULL) OR ((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))),
  constraint "bank_movements_deduplication_hash_key" unique (deduplication_hash),
  constraint "bank_movements_justification_type_check"
    check
    (((justification_type IS NULL) OR (justification_type = ANY (ARRAY['fatura'::text, 'recibo_comprovativo'::text, 'contrato_recorrencia'::text,
    'despesa_bancaria_automatica'::text, 'transferencia_interna'::text, 'emprestimo_financiamento'::text, 'sem_justificativa'::text])))),
  constraint "bank_movements_matched_entity_type_check"
    check
    (((matched_entity_type IS NULL) OR (matched_entity_type = ANY (ARRAY['invoice'::text, 'payable_entry'::text, 'receipt'::text, 'internal_transfer'::text, 'manual_entry'::text,
    'recurrence_occurrence'::text])))),
  constraint "bank_movements_movement_type_check" check ((movement_type = ANY (ARRAY['debit'::text, 'credit'::text]))),
  constraint "bank_movements_pkey" primary key (id),
  constraint "bank_movements_reconciliation_status_check"
    check
    ((reconciliation_status = ANY (ARRAY['conciliado_com_fatura'::text, 'conciliado_parcial'::text, 'conciliado_sem_fatura'::text, 'justificado'::text, 'sugestao'::text,
    'pendente_de_documento'::text, 'saida_nao_justificada'::text, 'transferencia_interna'::text, 'divergente'::text, 'ignorado_com_motivo'::text]))),
  constraint "bank_movements_risk_level_check" check ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);

alter table "public"."bank_movements"
  enable row level security;

create table "public"."bank_reconciliation_rules" (
  "id"                      uuid                     not null default gen_random_uuid(),
  "name"                    text                     not null,
  "description_contains"    text                     not null,
  "movement_type"           text,
  "cost_center_group_id"    uuid,
  "cost_center_category_id" uuid,
  "justification_type"      text                     not null,
  "requires_document"       boolean                  not null default false,
  "affects_dre"             boolean                  not null default true,
  "affects_cashflow"        boolean                  not null default true,
  "affects_profitability"   boolean                  not null default false,
  "risk_level"              text                     not null default 'low'::text,
  "is_active"               boolean                  not null default true,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  constraint "bank_reconciliation_rules_justification_type_check"
    check
    ((justification_type = ANY (ARRAY['fatura'::text, 'recibo_comprovativo'::text, 'contrato_recorrencia'::text, 'despesa_bancaria_automatica'::text, 'transferencia_interna'::text,
    'emprestimo_financiamento'::text, 'sem_justificativa'::text]))),
  constraint "bank_reconciliation_rules_movement_type_check" check (((movement_type IS NULL) OR (movement_type = ANY (ARRAY['debit'::text, 'credit'::text])))),
  constraint "bank_reconciliation_rules_pkey" primary key (id),
  constraint "bank_reconciliation_rules_risk_level_check" check ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);

alter table "public"."bank_reconciliation_rules"
  enable row level security;

create table "public"."bank_statement_imports" (
  "id"                         uuid                     not null default gen_random_uuid(),
  "bank_name"                  text                     not null,
  "account_number"             text                     not null,
  "period_start"               date                     not null,
  "period_end"                 date                     not null,
  "currency"                   text                     not null default 'EUR'::text,
  "source_type"                text                     not null,
  "source_file_name"           text,
  "imported_movements_count"   integer                  not null default 0,
  "opening_balance"            integer                  not null default 0,
  "closing_balance"            integer                  not null default 0,
  "calculated_closing_balance" integer                  not null default 0,
  "balance_difference"         integer                  not null default 0,
  "reconciliation_progress"    numeric(5,2)             not null default 0,
  "status"                     text                     not null default 'draft'::text,
  "created_at"                 timestamp with time zone not null default now(),
  "updated_at"                 timestamp with time zone not null default now(),
  "bank_account_id"            uuid,
  constraint "bank_statement_imports_pkey" primary key (id),
  constraint "bank_statement_imports_source_type_check" check ((source_type = ANY (ARRAY['csv'::text, 'xlsx'::text, 'manual'::text]))),
  constraint "bank_statement_imports_status_check" check ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'completed'::text, 'closed'::text])))
);

alter table "public"."bank_statement_imports"
  enable row level security;

create table "public"."banks" (
  "id"               uuid                     not null default gen_random_uuid(),
  "name"             text                     not null,
  "logo_key"         text                     not null,
  "color"            text                     not null,
  "country"          text                     not null default 'PT'::text,
  "bic"              text,
  "statement_format" text                     not null,
  "created_at"       timestamp with time zone not null default now(),
  "updated_at"       timestamp with time zone not null default now(),
  constraint "banks_pkey" primary key (id)
);

alter table "public"."banks"
  enable row level security;

create table "public"."cash_closings" (
  "id"                   uuid                     not null default gen_random_uuid(),
  "closing_date"         date                     not null,
  "employee_id"          uuid                     not null,
  "tpa"                  numeric(10,2)            not null default 0,
  "uber"                 numeric(10,2)            not null default 0,
  "glovo"                numeric(10,2)            not null default 0,
  "bolt"                 numeric(10,2)            not null default 0,
  "eatz"                 numeric(10,2)            not null default 0,
  "cash_sales"           numeric(10,2)            not null default 0,
  "total_calculated"     numeric(10,2)            not null,
  "vendus_total"         numeric(10,2),
  "sangria_amount"       numeric(10,2)            not null default 0,
  "notes"                text,
  "status"               text                     not null default 'pending'::text,
  "manager_notes"        text,
  "reviewed_at"          timestamp with time zone,
  "submitted_at"         timestamp with time zone not null default now(),
  "created_at"           timestamp with time zone not null default now(),
  "cash_in"              numeric(10,2)            not null default 0,
  "cash_out"             numeric(10,2)            not null default 0,
  "cash_drawer_total"    numeric(10,2)            not null default 0,
  "cash_drawer_open"     numeric(10,2)            not null default 0,
  "session_opened_at"    timestamp with time zone,
  "drawer_denominations" jsonb,
  "air_menu_uber"        numeric,
  "air_menu_glovo"       numeric,
  "air_menu_bolt"        numeric,
  constraint "cash_closings_pkey" primary key (id),
  constraint "cash_closings_status_check" check ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

alter table "public"."cash_closings"
  enable row level security;

create table "public"."channels" (
  "id"         uuid                     not null default gen_random_uuid(),
  "code"       text                     not null,
  "name"       text                     not null,
  "sort_order" integer                  not null default 0,
  "is_active"  boolean                  not null default true,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "channels_code_key" unique (code),
  constraint "channels_pkey" primary key (id)
);

alter table "public"."channels"
  enable row level security;

create table "public"."classification_rules" (
  "id"                              uuid                     not null,
  "supplier_id"                     uuid                     not null,
  "default_cost_center_id"          uuid,
  "default_line_type"               text,
  "default_category"                text,
  "confidence_boost"                integer                  not null default 0,
  "created_at"                      timestamp with time zone not null default now(),
  "updated_at"                      timestamp with time zone not null default now(),
  "default_cost_center_category_id" uuid,
  "description_pattern"             text,
  "channel_id"                      uuid,
  constraint "classification_rules_pkey" primary key (id),
  constraint "classification_rules_supplier_id_key" unique (supplier_id)
);

alter table "public"."classification_rules"
  enable row level security;

create table "public"."cost_center_categories" (
  "id"                    uuid                     not null default gen_random_uuid(),
  "group_id"              uuid                     not null,
  "code"                  text                     not null,
  "name"                  text                     not null,
  "financial_type"        text                     not null,
  "affects_dre"           boolean                  not null default false,
  "affects_cashflow"      boolean                  not null default false,
  "affects_profitability" boolean                  not null default false,
  "requires_channel"      boolean                  not null default false,
  "requires_allocation"   boolean                  not null default false,
  "is_active"             boolean                  not null default true,
  "description"           text,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  constraint "cost_center_categories_code_key" unique (code),
  constraint "cost_center_categories_pkey" primary key (id)
);

alter table "public"."cost_center_categories"
  enable row level security;

create table "public"."cost_center_groups" (
  "id"          uuid                     not null default gen_random_uuid(),
  "code"        text                     not null,
  "name"        text                     not null,
  "description" text,
  "sort_order"  integer                  not null default 0,
  "is_active"   boolean                  not null default true,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "cost_center_groups_code_key" unique (code),
  constraint "cost_center_groups_pkey" primary key (id)
);

alter table "public"."cost_center_groups"
  enable row level security;

create table "public"."cost_centers" (
  "id"               uuid                     not null default gen_random_uuid(),
  "code"             text                     not null,
  "name"             text                     not null,
  "category"         text                     not null,
  "subcategory"      text,
  "description"      text,
  "responsible_name" text,
  "status"           text                     not null default 'active'::text,
  "created_at"       timestamp with time zone not null default now(),
  "updated_at"       timestamp with time zone not null default now(),
  constraint "cost_centers_code_key" unique (code),
  constraint "cost_centers_pkey" primary key (id)
);

alter table "public"."cost_centers"
  enable row level security;

create table "public"."crm_action_types" (
  "code"       text                     not null,
  "name"       text                     not null,
  "color"      text                     not null default '#6b7280'::text,
  "active"     boolean                  not null default true,
  "system"     boolean                  not null default false,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "crm_action_types_pkey" primary key (code)
);

alter table "public"."crm_action_types"
  enable row level security;

create table "public"."crm_contacts" (
  "id"              uuid                     not null default gen_random_uuid(),
  "customer_id"     text                     not null,
  "contacted_at"    timestamp with time zone not null,
  "channel"         text,
  "script_code"     text,
  "direction"       text                     not null default 'Enviado'::text,
  "status"          text,
  "response"        text,
  "notes"           text,
  "segment_at_time" text,
  "created_at"      timestamp with time zone not null default now(),
  "tags_added"      text[]                   not null default '{}'::text[],
  "tags_removed"    text[]                   not null default '{}'::text[],
  constraint "crm_contacts_channel_check" check ((channel = ANY (ARRAY['WhatsApp'::text, 'Email'::text, 'SMS'::text]))),
  constraint "crm_contacts_direction_check" check ((direction = ANY (ARRAY['Enviado'::text, 'Recebido'::text]))),
  constraint "crm_contacts_pkey" primary key (id),
  constraint "crm_contacts_response_check" check ((response = ANY (ARRAY['Positivo'::text, 'Neutro'::text, 'Negativo'::text, 'Sem Resposta'::text]))),
  constraint "crm_contacts_status_check"
    check ((status = ANY (ARRAY['Enviado'::text, 'Entregue'::text, 'Lido'::text, 'Respondeu'::text, 'Sem resposta'::text, 'Não Respondeu'::text])))
);

alter table "public"."crm_contacts"
  enable row level security;

create table "public"."crm_customer_actions" (
  "id"                uuid                     not null default gen_random_uuid(),
  "customer_id"       text                     not null,
  "action_type_code"  text                     not null,
  "status"            text                     not null default 'pending'::text,
  "scheduled_for"     timestamp with time zone,
  "completed_at"      timestamp with time zone,
  "notes"             text,
  "script_code"       text,
  "source_contact_id" uuid,
  "source_key"        text,
  "created_by"        uuid,
  "created_at"        timestamp with time zone not null default now(),
  "updated_at"        timestamp with time zone not null default now(),
  constraint "crm_customer_actions_dates_check" check (((status <> 'completed'::text) OR (completed_at IS NOT NULL))),
  constraint "crm_customer_actions_pkey" primary key (id),
  constraint "crm_customer_actions_source_contact_id_key" unique (source_contact_id),
  constraint "crm_customer_actions_source_key_key" unique (source_key),
  constraint "crm_customer_actions_status_check" check ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])))
);

alter table "public"."crm_customer_actions"
  enable row level security;

create table "public"."crm_customer_tags" (
  "customer_id" text                     not null,
  "tag_name"    text                     not null,
  "added_at"    timestamp with time zone not null default now(),
  constraint "crm_customer_tags_pkey" primary key (customer_id, tag_name)
);

alter table "public"."crm_customer_tags"
  enable row level security;

create table "public"."crm_customers" (
  "id"                    text                     not null,
  "first_name"            text                     not null,
  "last_name"             text,
  "email"                 text,
  "phone"                 text,
  "preferred_channel"     text                     not null default 'WhatsApp'::text,
  "birthday"              date,
  "how_found"             text,
  "opt_in"                text                     not null default 'Pendente'::text,
  "notes"                 text,
  "inactive"              boolean                  not null default false,
  "referred_by"           text,
  "seg07_path"            text,
  "registered_at"         date                     not null default CURRENT_DATE,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  "manual_followup_date"  date,
  "eatz_registered_at"    date,
  "eatz_last_order_date"  date,
  "eatz_order_count"      integer,
  "eatz_total_spent"      numeric(12,2),
  "eatz_avg_ticket"       numeric(12,2),
  "eatz_segment"          text,
  "eatz_marketing_opt_in" boolean,
  "eatz_snapshot_at"      date,
  constraint "crm_customers_eatz_avg_ticket_nonnegative" check (((eatz_avg_ticket IS NULL) OR (eatz_avg_ticket >= (0)::numeric))),
  constraint "crm_customers_eatz_order_count_nonnegative" check (((eatz_order_count IS NULL) OR (eatz_order_count >= 0))),
  constraint "crm_customers_eatz_segment_valid" check (((eatz_segment IS NULL) OR (eatz_segment = ANY (ARRAY['Novo'::text, 'Inativo'::text, 'Recorrente'::text])))),
  constraint "crm_customers_eatz_total_spent_nonnegative" check (((eatz_total_spent IS NULL) OR (eatz_total_spent >= (0)::numeric))),
  constraint "crm_customers_how_found_check" check ((how_found = ANY (ARRAY['Indicação'::text, 'Redes Sociais'::text, 'Walk-in'::text, 'Passagem'::text, 'Outro'::text]))),
  constraint "crm_customers_opt_in_check" check ((opt_in = ANY (ARRAY['Pendente'::text, 'Sim'::text, 'Não'::text]))),
  constraint "crm_customers_pkey" primary key (id),
  constraint "crm_customers_preferred_channel_check" check ((preferred_channel = ANY (ARRAY['WhatsApp'::text, 'Email'::text, 'SMS'::text]))),
  constraint "crm_customers_seg07_path_check" check ((seg07_path = ANY (ARRAY['A'::text, 'B'::text])))
);

alter table "public"."crm_customers"
  enable row level security;

create table "public"."crm_orders" (
  "id"          uuid                     not null default gen_random_uuid(),
  "customer_id" text                     not null,
  "order_date"  date                     not null,
  "total_value" numeric(10,2)            not null,
  "status"      text                     not null default 'concluído'::text,
  "notes"       text,
  "created_at"  timestamp with time zone not null default now(),
  constraint "crm_orders_pkey" primary key (id),
  constraint "crm_orders_status_check" check ((status = ANY (ARRAY['concluído'::text, 'cancelado'::text]))),
  constraint "crm_orders_total_value_check" check ((total_value >= (0)::numeric))
);

alter table "public"."crm_orders"
  enable row level security;

create table "public"."crm_parameters" (
  "key"         text                     not null,
  "value"       text                     not null,
  "description" text,
  "category"    text                     not null default 'geral'::text,
  "updated_at"  timestamp with time zone not null default now(),
  constraint "crm_parameters_pkey" primary key (key)
);

alter table "public"."crm_parameters"
  enable row level security;

create table "public"."crm_scripts" (
  "code"           text                     not null,
  "name"           text                     not null,
  "segment"        text,
  "body"           text                     not null,
  "variants"       jsonb,
  "channel"        text,
  "trigger_timing" text,
  "one_shot"       boolean                  not null default false,
  "cooldown_days"  integer,
  "active"         boolean                  not null default true,
  "created_at"     timestamp with time zone not null default now(),
  "updated_at"     timestamp with time zone not null default now(),
  constraint "crm_scripts_pkey" primary key (code)
);

alter table "public"."crm_scripts"
  enable row level security;

create table "public"."crm_tags" (
  "name"        text                     not null,
  "description" text,
  "color"       text                     not null default '#6b7280'::text,
  "category"    text                     not null default 'geral'::text,
  "label"       text                     not null,
  "active"      boolean                  not null default true,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "crm_tags_category_check" check ((category = ANY (ARRAY['feedback'::text, 'comportamento'::text, 'alerta'::text, 'estado'::text, 'geral'::text]))),
  constraint "crm_tags_pkey" primary key (name)
);

alter table "public"."crm_tags"
  enable row level security;

create table "public"."dre_custos_fixos" (
  "id"            uuid                     not null default gen_random_uuid(),
  "year"          smallint                 not null,
  "month"         smallint                 not null,
  "descricao"     text                     not null default ''::text,
  "valor"         numeric(12,2)            not null default 0,
  "valor_sem_iva" numeric(12,2)            not null default 0,
  "observacao"    text                     not null default ''::text,
  "created_at"    timestamp with time zone default now(),
  "updated_at"    timestamp with time zone default now(),
  constraint "dre_custos_fixos_pkey" primary key (id)
);

alter table "public"."dre_custos_fixos"
  enable row level security;

create table "public"."dre_custos_variaveis" (
  "id"            uuid                     not null default gen_random_uuid(),
  "year"          smallint                 not null,
  "month"         smallint                 not null,
  "categoria"     text                     not null,
  "descricao"     text                     not null default ''::text,
  "valor"         numeric(12,2)            not null default 0,
  "valor_sem_iva" numeric(12,2)            not null default 0,
  "observacao"    text                     not null default ''::text,
  "created_at"    timestamp with time zone default now(),
  "updated_at"    timestamp with time zone default now(),
  constraint "dre_custos_variaveis_categoria_check" check ((categoria = ANY (ARRAY['producao'::text, 'venda'::text]))),
  constraint "dre_custos_variaveis_pkey" primary key (id)
);

alter table "public"."dre_custos_variaveis"
  enable row level security;

create table "public"."hr_audit_logs" (
  "id"             uuid                     not null default gen_random_uuid(),
  "created_at"     timestamp with time zone not null default now(),
  "entity_type"    text                     not null,
  "entity_id"      text                     not null,
  "action"         text                     not null,
  "actor"          text,
  "description"    text                     not null,
  "payload_before" jsonb,
  "payload_after"  jsonb,
  "employee_id"    text,
  constraint "hr_audit_logs_pkey" primary key (id)
);

create table "public"."hr_employee_documents" (
  "id"            uuid                     not null default gen_random_uuid(),
  "employee_id"   uuid                     not null,
  "document_type" text                     not null,
  "file_name"     text                     not null,
  "storage_path"  text                     not null,
  "uploaded_at"   timestamp with time zone not null default now(),
  constraint "hr_employee_documents_document_type_check" check ((document_type = ANY (ARRAY['contract'::text, 'id_card'::text, 'nif'::text, 'iban'::text, 'other'::text]))),
  constraint "hr_employee_documents_pkey" primary key (id)
);

alter table "public"."hr_employee_documents"
  enable row level security;

create table "public"."hr_employee_payments" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "employee_id"         uuid                     not null,
  "payment_date"        date                     not null,
  "amount"              numeric(14,2)            not null,
  "payment_type"        text                     not null,
  "notes"               text,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  "salary_period_year"  smallint,
  "salary_period_month" smallint,
  "is_paid"             boolean                  not null default false,
  constraint "hr_employee_payments_payment_type_check" check ((payment_type = ANY (ARRAY['salary'::text, 'bonus'::text, 'deduction'::text, 'other'::text]))),
  constraint "hr_employee_payments_pkey" primary key (id)
);

alter table "public"."hr_employee_payments"
  enable row level security;

create table "public"."hr_employees" (
  "id"                      uuid                     not null default gen_random_uuid(),
  "full_name"               text                     not null,
  "email"                   text,
  "phone"                   text,
  "role_or_notes"           text,
  "status"                  text                     not null default 'active'::text,
  "hired_at"                timestamp with time zone,
  "ended_at"                timestamp with time zone,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  "employment_type"         text                     not null default 'permanent'::text,
  "job_role"                text                     not null default 'service'::text,
  "weekly_schedule"         jsonb,
  "kiosk_pin_hash"          text,
  "base_salary"             numeric(10,2),
  "salary_type"             text                     not null default 'fixed'::text,
  "hourly_rate"             numeric(8,2),
  "nif"                     text,
  "iban"                    text,
  "address"                 text,
  "birth_date"              date,
  "social_security_number"  text,
  "id_card_number"          text,
  "nationality"             text,
  "emergency_contact_name"  text,
  "emergency_contact_phone" text,
  constraint "hr_employees_employment_type_check" check ((employment_type = ANY (ARRAY['permanent'::text, 'contract'::text, 'extra'::text]))),
  constraint "hr_employees_job_role_check" check ((job_role = ANY (ARRAY['manager'::text, 'prep'::text, 'service'::text]))),
  constraint "hr_employees_pkey" primary key (id),
  constraint "hr_employees_salary_type_check" check ((salary_type = ANY (ARRAY['fixed'::text, 'hourly'::text]))),
  constraint "hr_employees_status_check" check ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

alter table "public"."hr_employees"
  enable row level security;

create table "public"."hr_leave_balances" (
  "id"                uuid                     not null default gen_random_uuid(),
  "employee_id"       text                     not null,
  "year"              integer                  not null,
  "days_entitled"     integer                  not null default 22,
  "days_carried_over" integer                  not null default 0,
  "notes"             text,
  "created_at"        timestamp with time zone not null default now(),
  "updated_at"        timestamp with time zone not null default now(),
  constraint "hr_leave_balances_employee_id_year_key" unique (employee_id, year),
  constraint "hr_leave_balances_pkey" primary key (id)
);

create table "public"."hr_leave_requests" (
  "id"           uuid                     not null default gen_random_uuid(),
  "employee_id"  text                     not null,
  "type"         text                     not null,
  "start_date"   date                     not null,
  "end_date"     date                     not null,
  "working_days" integer                  not null default 0,
  "notes"        text,
  "created_at"   timestamp with time zone not null default now(),
  "updated_at"   timestamp with time zone not null default now(),
  constraint "hr_leave_dates_check" check ((end_date >= start_date)),
  constraint "hr_leave_requests_pkey" primary key (id),
  constraint "hr_leave_requests_type_check" check ((type = ANY (ARRAY['vacation'::text, 'sick_leave'::text, 'justified'::text, 'unjustified'::text, 'compensatory'::text])))
);

create table "public"."hr_public_holidays" (
  "id"          uuid    not null default gen_random_uuid(),
  "date"        date    not null,
  "name"        text    not null,
  "is_national" boolean not null default true,
  constraint "hr_public_holidays_date_key" unique (date),
  constraint "hr_public_holidays_pkey" primary key (id)
);

create table "public"."hr_shift_attendance" (
  "id"                        uuid                     not null default gen_random_uuid(),
  "work_shift_id"             uuid                     not null,
  "status"                    text                     not null,
  "actual_start_time"         time without time zone,
  "actual_end_time"           time without time zone,
  "late_minutes"              integer,
  "notes"                     text,
  "registration_source"       text                     not null default 'dashboard'::text,
  "registered_by_employee_id" uuid,
  "registered_at"             timestamp with time zone not null default now(),
  "updated_at"                timestamp with time zone not null default now(),
  constraint "hr_shift_attendance_actual_order" check (((actual_start_time IS NULL) OR (actual_end_time IS NULL) OR (actual_start_time < actual_end_time))),
  constraint "hr_shift_attendance_pkey" primary key (id),
  constraint "hr_shift_attendance_registration_source_check" check ((registration_source = ANY (ARRAY['dashboard'::text, 'employee_qr'::text, 'import'::text]))),
  constraint "hr_shift_attendance_status_check" check ((status = ANY (ARRAY['worked_as_planned'::text, 'late'::text, 'left_early'::text, 'cancelled'::text]))),
  constraint "hr_shift_attendance_work_shift_id_key" unique (work_shift_id)
);

alter table "public"."hr_shift_attendance"
  enable row level security;

create table "public"."hr_work_shifts" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "employee_id"         uuid                     not null,
  "work_date"           date                     not null,
  "start_time"          time without time zone   not null,
  "end_time"            time without time zone   not null,
  "location_or_station" text,
  "notes"               text,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  constraint "hr_work_shifts_pkey" primary key (id),
  constraint "hr_work_shifts_time_order" check ((start_time < end_time))
);

alter table "public"."hr_work_shifts"
  enable row level security;

create table "public"."invoice_lines" (
  "id"                       uuid                     not null,
  "invoice_id"               uuid                     not null,
  "description"              text                     not null,
  "type"                     text                     not null default 'other'::text,
  "cost_center_id"           uuid,
  "category"                 text,
  "subcategory"              text,
  "stock_item_id"            uuid,
  "quantity"                 numeric                  not null,
  "unit"                     text,
  "unit_cost_without_vat"    bigint                   not null,
  "vat_rate"                 numeric                  not null,
  "vat_amount"               bigint                   not null,
  "total_with_vat"           bigint                   not null,
  "stock_entry_id"           uuid,
  "created_at"               timestamp with time zone not null default now(),
  "cost_center_category_id"  uuid,
  "affects_dre"              boolean                  not null default true,
  "affects_cashflow"         boolean                  not null default true,
  "affects_profitability"    boolean                  not null default false,
  "financial_type"           text,
  "channel_id"               uuid,
  "requires_channel"         boolean                  not null default false,
  "requires_allocation"      boolean                  not null default false,
  "ai_suggested_category_id" uuid,
  "ai_confidence"            numeric(5,4),
  constraint "invoice_lines_pkey" primary key (id)
);

alter table "public"."invoice_lines"
  enable row level security;

create table "public"."invoices" (
  "id"                      uuid                     not null,
  "supplier_id"             uuid,
  "supplier_name"           text                     not null,
  "invoice_number"          text                     not null,
  "invoice_date"            date                     not null,
  "due_date"                date,
  "paid_at"                 date,
  "subtotal_without_vat"    bigint                   not null,
  "total_vat"               bigint                   not null,
  "total_with_vat"          bigint                   not null,
  "status"                  text                     not null default 'pending'::text,
  "notes"                   text,
  "attachment_url"          text,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  "supplier_nif_snapshot"   text,
  "source"                  text                     not null default 'manual'::text,
  "ai_extraction_status"    text,
  "ai_confidence"           numeric,
  "requires_review"         boolean                  not null default false,
  "cost_center_group_id"    uuid,
  "financial_type"          text,
  "affects_dre"             boolean                  not null default true,
  "affects_cashflow"        boolean                  not null default true,
  "affects_profitability"   boolean                  not null default false,
  "currency"                text                     not null default 'EUR'::text,
  "cost_center_category_id" uuid,
  "is_direct_debit"         boolean                  not null default false,
  "direct_debit_date"       date,
  "reconciliation_status"   text                     not null default 'none'::text,
  "payment_bank_account_id" uuid,
  "line_detail_mode"        text                     not null default 'simple'::text,
  "competence_date"         date,
  "payment_method"          text,
  "payment_notes"           text,
  constraint "invoices_line_detail_mode_check" check ((line_detail_mode = ANY (ARRAY['simple'::text, 'detailed'::text]))),
  constraint "invoices_pkey" primary key (id),
  constraint "invoices_reconciliation_status_check"
    check ((reconciliation_status = ANY (ARRAY['none'::text, 'pending_reconciliation'::text, 'partially_reconciled'::text, 'reconciled'::text])))
);

alter table "public"."invoices"
  enable row level security;

create table "public"."payable_entries" (
  "id"             uuid                     not null default gen_random_uuid(),
  "invoice_id"     uuid,
  "supplier_id"    uuid,
  "supplier_name"  text                     not null,
  "description"    text                     not null,
  "cost_center_id" uuid,
  "category"       text,
  "amount"         integer                  not null,
  "due_date"       date                     not null,
  "paid_at"        date,
  "recurrence"     text                     not null default 'none'::text,
  "status"         text                     not null default 'pending'::text,
  "notes"          text,
  "created_at"     timestamp with time zone not null default now(),
  "updated_at"     timestamp with time zone not null default now(),
  "source"         text                     not null default 'invoice'::text,
  "payment_method" text,
  constraint "payable_entries_amount_check" check ((amount > 0)),
  constraint "payable_entries_payment_method_check"
    check ((payment_method = ANY (ARRAY['transfer'::text, 'direct_debit'::text, 'check'::text, 'cash'::text, 'card'::text, 'mbway'::text, 'other'::text]))),
  constraint "payable_entries_pkey" primary key (id),
  constraint "payable_entries_source_check" check ((source = ANY (ARRAY['invoice'::text, 'recurrence'::text])))
);

alter table "public"."payable_entries"
  enable row level security;

create table "public"."pizza_prices" (
  "id"         uuid                     not null default gen_random_uuid(),
  "pizza_id"   uuid                     not null,
  "price"      numeric(10,2)            not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  constraint "pizza_prices_pkey" primary key (id)
);

alter table "public"."pizza_prices"
  enable row level security;

create table "public"."pizza_recipe_items" (
  "id"             uuid                     not null default gen_random_uuid(),
  "recipe_id"      uuid                     not null,
  "stock_item_id"  uuid,
  "quantity"       numeric(14,3)            not null,
  "waste_factor"   numeric(5,4),
  "is_optional"    boolean                  not null default false,
  "created_at"     timestamp with time zone default now(),
  "preparation_id" uuid,
  constraint "pizza_recipe_items_pkey" primary key (id),
  constraint "pizza_recipe_items_xor_check" check ((((stock_item_id IS NOT NULL) AND (preparation_id IS NULL)) OR ((stock_item_id IS NULL) AND (preparation_id IS NOT NULL))))
);

alter table "public"."pizza_recipe_items"
  enable row level security;

create table "public"."pizza_recipes" (
  "id"         uuid                     not null default gen_random_uuid(),
  "pizza_id"   uuid                     not null,
  "version"    integer                  not null default 1,
  "is_active"  boolean                  not null default true,
  "notes"      text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  constraint "pizza_recipes_pizza_id_version_key" unique (pizza_id, version),
  constraint "pizza_recipes_pkey" primary key (id)
);

alter table "public"."pizza_recipes"
  enable row level security;

create table "public"."pizzas" (
  "id"          uuid                     not null default gen_random_uuid(),
  "name"        text                     not null,
  "description" text                     not null default ''::text,
  "is_active"   boolean                  not null default true,
  "created_at"  timestamp with time zone default now(),
  "updated_at"  timestamp with time zone default now(),
  constraint "pizzas_pkey" primary key (id)
);

alter table "public"."pizzas"
  enable row level security;

create table "public"."preparation_items" (
  "id"             uuid                     not null default gen_random_uuid(),
  "preparation_id" uuid                     not null,
  "stock_item_id"  uuid                     not null,
  "quantity"       numeric(14,3)            not null,
  "created_at"     timestamp with time zone default now(),
  constraint "preparation_items_pkey" primary key (id),
  constraint "preparation_items_preparation_id_stock_item_id_key" unique (preparation_id, stock_item_id),
  constraint "preparation_items_quantity_check" check ((quantity > (0)::numeric))
);

alter table "public"."preparation_items"
  enable row level security;

create table "public"."preparations" (
  "id"          uuid                     not null default gen_random_uuid(),
  "name"        text                     not null,
  "description" text,
  "yield_qty"   numeric(14,3)            not null,
  "yield_unit"  text                     not null,
  "created_at"  timestamp with time zone default now(),
  "updated_at"  timestamp with time zone default now(),
  "use_as_unit" boolean                  not null default false,
  constraint "preparations_pkey" primary key (id),
  constraint "preparations_yield_qty_check" check ((yield_qty > (0)::numeric))
);

alter table "public"."preparations"
  enable row level security;

create table "public"."recurring_contracts" (
  "id"                      uuid                     not null default gen_random_uuid(),
  "name"                    text                     not null,
  "supplier_id"             uuid,
  "supplier_name"           text                     not null,
  "type"                    text                     not null,
  "frequency"               text                     not null default 'monthly'::text,
  "cost_center_id"          uuid,
  "category"                text,
  "estimated_amount_cents"  integer                  not null,
  "day_of_month"            smallint                 not null,
  "start_date"              date                     not null,
  "end_date"                date,
  "payment_method"          text                     not null,
  "auto_create_payable"     boolean                  not null default false,
  "require_invoice"         boolean                  not null default false,
  "status"                  text                     not null default 'active'::text,
  "notes"                   text,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  "document_url"            text,
  "cost_center_category_id" uuid,
  constraint "end_date_after_start" check (((end_date IS NULL) OR (end_date >= start_date))),
  constraint "recurring_contracts_day_of_month_check" check (((day_of_month >= 1) AND (day_of_month <= 31))),
  constraint "recurring_contracts_estimated_amount_cents_check" check ((estimated_amount_cents > 0)),
  constraint "recurring_contracts_frequency_check" check ((frequency = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'annual'::text]))),
  constraint "recurring_contracts_payment_method_check"
    check ((payment_method = ANY (ARRAY['transfer'::text, 'direct_debit'::text, 'check'::text, 'cash'::text, 'card'::text, 'mbway'::text, 'other'::text]))),
  constraint "recurring_contracts_pkey" primary key (id),
  constraint "recurring_contracts_status_check" check ((status = ANY (ARRAY['active'::text, 'paused'::text, 'closed'::text]))),
  constraint "recurring_contracts_type_check"
    check ((type = ANY (ARRAY['fixed_contract'::text, 'variable_invoice'::text, 'recurring_service'::text, 'payroll'::text, 'bank_auto'::text, 'fiscal'::text])))
);

alter table "public"."recurring_contracts"
  enable row level security;

create table "public"."recurring_occurrences" (
  "id"                      uuid                     not null default gen_random_uuid(),
  "recurrence_id"           uuid                     not null,
  "period"                  character(7)             not null,
  "estimated_amount_cents"  integer                  not null,
  "real_amount_cents"       integer,
  "due_date"                date                     not null,
  "status"                  text                     not null default 'forecast'::text,
  "require_invoice"         boolean                  not null default false,
  "invoice_id"              uuid,
  "payable_entry_id"        uuid,
  "notes"                   text,
  "created_at"              timestamp with time zone not null default now(),
  "updated_at"              timestamp with time zone not null default now(),
  "document_url"            text,
  "paid_at"                 timestamp with time zone,
  "payment_method"          text,
  "payment_bank_account_id" uuid,
  "payment_notes"           text,
  constraint "recurring_occurrences_estimated_amount_cents_check" check ((estimated_amount_cents > 0)),
  constraint "recurring_occurrences_payment_method_check"
    check ((payment_method = ANY (ARRAY['transfer'::text, 'direct_debit'::text, 'check'::text, 'cash'::text, 'card'::text, 'mbway'::text, 'other'::text]))),
  constraint "recurring_occurrences_period_check" check ((period ~ '^\d{4}-\d{2}$'::text)),
  constraint "recurring_occurrences_pkey" primary key (id),
  constraint "recurring_occurrences_real_amount_cents_check" check (((real_amount_cents IS NULL) OR (real_amount_cents > 0))),
  constraint "recurring_occurrences_status_check"
    check ((status = ANY (ARRAY['forecast'::text, 'awaiting_invoice'::text, 'invoice_linked'::text, 'paid'::text, 'cancelled'::text]))),
  constraint "uq_recurrence_period" unique (recurrence_id, period)
);

alter table "public"."recurring_occurrences"
  enable row level security;

create table "public"."stock_categories" (
  "id"         uuid                     not null default gen_random_uuid(),
  "name"       text                     not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  constraint "stock_categories_pkey" primary key (id)
);

alter table "public"."stock_categories"
  enable row level security;

create table "public"."stock_items" (
  "id"                                       uuid                     not null default gen_random_uuid(),
  "name"                                     text                     not null,
  "sku"                                      text,
  "category_id"                              uuid                     not null,
  "is_sellable"                              boolean                  not null default false,
  "sale_price"                               numeric(10,2),
  "min_stock"                                numeric(14,3)            not null default 0,
  "is_active"                                boolean                  not null default true,
  "created_at"                               timestamp with time zone default now(),
  "updated_at"                               timestamp with time zone default now(),
  "purchase_reference_unit_cost_with_vat"    numeric(14,6),
  "purchase_reference_unit_cost_without_vat" numeric(14,6),
  constraint "stock_items_pkey" primary key (id),
  constraint "stock_items_sale_price_when_sellable" check ((((is_sellable = false) AND (sale_price IS NULL)) OR (is_sellable = true)))
);

alter table "public"."stock_items"
  enable row level security;

create table "public"."stock_movements" (
  "id"                                  uuid                     not null default gen_random_uuid(),
  "item_id"                             uuid                     not null,
  "quantity"                            numeric(14,3)            not null,
  "reason"                              text,
  "reference"                           text,
  "created_at"                          timestamp with time zone default now(),
  "created_by"                          text,
  "movement_date"                       timestamp with time zone not null default now(),
  "unit_cost_per_base_unit_with_vat"    numeric(14,6),
  "unit_cost_per_base_unit_without_vat" numeric(14,6),
  constraint "stock_movements_pkey" primary key (id)
);

alter table "public"."stock_movements"
  enable row level security;

create table "public"."supplier_article_mappings" (
  "id"                                      uuid                     not null default gen_random_uuid(),
  "supplier_normalized"                     text                     not null,
  "supplier_article_code"                   text                     not null,
  "supplier_article_description"            text,
  "stock_item_id"                           uuid                     not null,
  "created_at"                              timestamp with time zone not null default now(),
  "updated_at"                              timestamp with time zone not null default now(),
  "quantity_per_invoice_unit"               numeric                  not null default 1,
  "supplier_article_description_normalized" text[],
  "invoice_quantity"                        numeric(14,3),
  "invoice_unit"                            text,
  "stock_quantity"                          numeric(14,3),
  "stock_unit"                              text,
  constraint "supplier_article_mappings_pkey" primary key (id),
  constraint "supplier_article_mappings_supplier_item_unique" unique (supplier_normalized, stock_item_id)
);

create table "public"."supplier_import_hints" (
  "id"              uuid                     not null default gen_random_uuid(),
  "normalized_name" text                     not null,
  "supplier_id"     uuid                     not null,
  "use_count"       integer                  not null default 1,
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  constraint "supplier_import_hints_normalized_name_supplier_id_key" unique (normalized_name, supplier_id),
  constraint "supplier_import_hints_pkey" primary key (id)
);

alter table "public"."supplier_import_hints"
  enable row level security;

create table "public"."supplier_invoice_import_lines" (
  "id"                    uuid          not null default gen_random_uuid(),
  "import_id"             uuid          not null,
  "line_index"            integer       not null,
  "description"           text          not null,
  "quantity"              numeric(14,3) not null,
  "unit"                  text,
  "unit_price_net"        numeric(14,6),
  "unit_price_gross"      numeric(14,6),
  "vat_rate"              numeric(8,4),
  "line_total_net"        numeric(14,3),
  "line_total_gross"      numeric(14,3),
  "stock_item_id"         uuid,
  "match_confidence"      numeric(5,4),
  "notes"                 text,
  "supplier_article_code" text,
  "discount_pct"          numeric,
  "raw_invoice_quantity"  numeric(14,3),
  constraint "supplier_invoice_import_lines_import_id_line_index_key" unique (import_id, line_index),
  constraint "supplier_invoice_import_lines_pkey" primary key (id)
);

alter table "public"."supplier_invoice_import_lines"
  enable row level security;

create table "public"."supplier_invoice_imports" (
  "id"                     uuid                     not null default gen_random_uuid(),
  "storage_bucket"         text                     not null default 'invoice-imports'::text,
  "storage_path"           text                     not null,
  "file_name"              text                     not null,
  "file_mime"              text                     not null,
  "file_sha256"            text                     not null,
  "file_size"              integer                  not null,
  "supplier_name"          text,
  "supplier_normalized"    text,
  "invoice_number"         text,
  "invoice_date"           date,
  "currency"               text                     not null default 'EUR'::text,
  "subtotal"               numeric(14,3),
  "tax_total"              numeric(14,3),
  "total"                  numeric(14,3),
  "business_key"           text,
  "duplicate_warning"      boolean                  not null default false,
  "duplicate_of_import_id" uuid,
  "parse_error"            text,
  "raw_openai_json"        jsonb,
  "created_at"             timestamp with time zone not null default now(),
  "updated_at"             timestamp with time zone not null default now(),
  "confirmed_at"           timestamp with time zone,
  constraint "supplier_invoice_imports_pkey" primary key (id)
);

alter table "public"."supplier_invoice_imports"
  enable row level security;

create table "public"."suppliers" (
  "id"                              uuid                     not null default gen_random_uuid(),
  "name"                            text                     not null,
  "nif"                             text,
  "email"                           text,
  "phone"                           text,
  "address"                         text,
  "iban"                            text,
  "payment_terms_days"              integer,
  "notes"                           text,
  "status"                          text                     not null default 'active'::text,
  "created_at"                      timestamp with time zone not null default now(),
  "updated_at"                      timestamp with time zone not null default now(),
  "default_cost_center_group_id"    uuid,
  "default_cost_center_category_id" uuid,
  "default_financial_type"          text,
  constraint "suppliers_pkey" primary key (id)
);

alter table "public"."suppliers"
  enable row level security;

create table "public"."vendus_product_mapping" (
  "id"            uuid                     not null default gen_random_uuid(),
  "match_by"      text                     not null,
  "match_value"   text                     not null,
  "target_type"   text                     not null,
  "pizza_id"      uuid,
  "stock_item_id" uuid,
  "created_at"    timestamp with time zone default now(),
  constraint "vendus_product_mapping_match_by_check" check ((match_by = ANY (ARRAY['reference'::text, 'title'::text]))),
  constraint "vendus_product_mapping_match_by_match_value_key" unique (match_by, match_value),
  constraint "vendus_product_mapping_pkey" primary key (id),
  constraint "vendus_product_mapping_target_type_check" check ((target_type = ANY (ARRAY['pizza'::text, 'stock'::text])))
);

alter table "public"."vendus_product_mapping"
  enable row level security;

create type "public"."pizza_category" as enum (
  'classics',
  'specials',
  'sweeties'
);

alter table "public"."pizzas"
  add column "category" public.pizza_category not null;

create type "public"."pizza_size" as enum (
  'small',
  'large'
);

alter table "public"."pizza_prices"
  add column "size" public.pizza_size not null;

alter table "public"."pizza_recipe_items"
  add column "size" public.pizza_size not null;

alter table "public"."vendus_product_mapping"
  add column "pizza_size" public.pizza_size;

create type "public"."stock_base_unit" as enum (
  'g',
  'kg',
  'ml',
  'l',
  'un',
  'cl'
);

alter table "public"."stock_items"
  add column "base_unit" public.stock_base_unit not null;

create type "public"."stock_item_type" as enum (
  'ingredient',
  'beverage',
  'packaging',
  'cleaning',
  'other',
  'consumable'
);

alter table "public"."stock_items"
  add column "type" public.stock_item_type not null;

create type "public"."stock_movement_type" as enum (
  'purchase',
  'consumption',
  'sale',
  'loss',
  'adjustment',
  'transfer'
);

alter table "public"."stock_movements"
  add column "type" public.stock_movement_type not null;

create type "public"."supplier_invoice_import_status" as enum (
  'uploaded',
  'processing',
  'ready_for_review',
  'failed',
  'confirmed',
  'cancelled'
);

alter table "public"."supplier_invoice_imports"
  add column "status" public.supplier_invoice_import_status not null default 'uploaded'::public.supplier_invoice_import_status;

create type "public"."supplier_invoice_line_status" as enum (
  'matched',
  'needs_review',
  'ignored'
);

alter table "public"."supplier_invoice_import_lines"
  add column "line_status" public.supplier_invoice_line_status not null default 'needs_review'::public.supplier_invoice_line_status;

create or replace function public.custom_access_token_hook (
  event jsonb
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
  AS $function$
DECLARE
  claims   jsonb;
  app_role text;
BEGIN
  SELECT role INTO app_role
  FROM public.app_users
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF app_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$function$;

create or replace function public.get_stock_quantities_with_last_purchase (
  p_item_ids uuid[]
)
  returns table (
    item_id                   uuid,
    total_quantity            numeric,
    last_purchase_with_vat    numeric,
    last_purchase_without_vat numeric
  )
  language sql
  security definer
  set search_path to 'public'
  AS $function$
  with totals as (
    select sm.item_id, sum(sm.quantity) as total_quantity
    from stock_movements sm
    where sm.item_id = any(p_item_ids)
    group by sm.item_id
  ),
  last_purchases as (
    select distinct on (sm.item_id)
      sm.item_id,
      sm.unit_cost_per_base_unit_with_vat    as last_purchase_with_vat,
      sm.unit_cost_per_base_unit_without_vat as last_purchase_without_vat
    from stock_movements sm
    where sm.item_id = any(p_item_ids)
      and sm.type = 'purchase'
      and sm.quantity > 0
      and (
        sm.unit_cost_per_base_unit_with_vat    is not null
        or sm.unit_cost_per_base_unit_without_vat is not null
      )
    order by sm.item_id, sm.movement_date desc, sm.created_at desc
  )
  select
    t.item_id,
    coalesce(t.total_quantity, 0)                     as total_quantity,
    lp.last_purchase_with_vat,
    lp.last_purchase_without_vat
  from totals t
  left join last_purchases lp on lp.item_id = t.item_id;
$function$;

alter table "public"."app_users"
  add constraint "app_users_id_fkey" foreign key (id) references auth.users(id) on delete cascade;

alter table "public"."bank_movements"
  add constraint "bank_movements_bank_account_id_fkey" foreign key (bank_account_id) references public.bank_accounts(id) on delete set null;

alter table "public"."bank_movement_entity_links"
  add constraint "bank_movement_entity_links_movement_id_fkey" foreign key (movement_id) references public.bank_movements(id) on delete cascade;

alter table "public"."bank_statement_imports"
  add constraint "bank_statement_imports_bank_account_id_fkey" foreign key (bank_account_id) references public.bank_accounts(id);

alter table "public"."bank_movements"
  add constraint "bank_movements_statement_import_id_fkey" foreign key (statement_import_id) references public.bank_statement_imports(id) on delete cascade;

alter table "public"."bank_accounts"
  add constraint "bank_accounts_bank_id_fkey" foreign key (bank_id) references public.banks(id);

alter table "public"."classification_rules"
  add constraint "classification_rules_channel_id_fkey" foreign key (channel_id) references public.channels(id) on delete set null;

alter table "public"."bank_movements"
  add constraint "bank_movements_cost_center_category_id_fkey" foreign key (cost_center_category_id) references public.cost_center_categories(id) on delete set null;

alter table "public"."classification_rules"
  add constraint "classification_rules_default_cost_center_category_id_fkey" foreign key (default_cost_center_category_id) references public.cost_center_categories(id);

alter table "public"."bank_movements"
  add constraint "bank_movements_cost_center_group_id_fkey" foreign key (cost_center_group_id) references public.cost_center_groups(id) on delete set null;

alter table "public"."cost_center_categories"
  add constraint "cost_center_categories_group_id_fkey" foreign key (group_id) references public.cost_center_groups(id);

alter table "public"."classification_rules"
  add constraint "classification_rules_default_cost_center_id_fkey" foreign key (default_cost_center_id) references public.cost_centers(id) on delete set null;

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_action_type_code_fkey" foreign key (action_type_code) references public.crm_action_types(code);

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_created_by_fkey" foreign key (created_by) references auth.users(id) on delete set null;

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_source_contact_id_fkey" foreign key (source_contact_id) references public.crm_contacts(id) on delete set null;

alter table "public"."crm_contacts"
  add constraint "crm_contacts_customer_id_fkey" foreign key (customer_id) references public.crm_customers(id) on delete cascade;

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_customer_id_fkey" foreign key (customer_id) references public.crm_customers(id) on delete cascade;

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_customer_id_fkey" foreign key (customer_id) references public.crm_customers(id) on delete cascade;

alter table "public"."crm_customers"
  add constraint "crm_customers_referred_by_fkey" foreign key (referred_by) references public.crm_customers(id);

alter table "public"."crm_orders"
  add constraint "crm_orders_customer_id_fkey" foreign key (customer_id) references public.crm_customers(id) on delete cascade;

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_tag_name_fkey" foreign key (tag_name) references public.crm_tags(name) on delete cascade;

alter table "public"."cash_closings"
  add constraint "cash_closings_employee_id_fkey" foreign key (employee_id) references public.hr_employees(id);

alter table "public"."hr_employee_documents"
  add constraint "hr_employee_documents_employee_id_fkey" foreign key (employee_id) references public.hr_employees(id) on delete cascade;

alter table "public"."hr_employee_payments"
  add constraint "hr_employee_payments_employee_id_fkey" foreign key (employee_id) references public.hr_employees(id) on delete restrict;

alter table "public"."hr_shift_attendance"
  add constraint "hr_shift_attendance_registered_by_employee_id_fkey" foreign key (registered_by_employee_id) references public.hr_employees(id) on delete set null;

alter table "public"."hr_work_shifts"
  add constraint "hr_work_shifts_employee_id_fkey" foreign key (employee_id) references public.hr_employees(id) on delete restrict;

alter table "public"."hr_shift_attendance"
  add constraint "hr_shift_attendance_work_shift_id_fkey" foreign key (work_shift_id) references public.hr_work_shifts(id) on delete cascade;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_ai_suggested_category_id_fkey" foreign key (ai_suggested_category_id) references public.cost_center_categories(id) on delete set null;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_channel_id_fkey" foreign key (channel_id) references public.channels(id) on delete set null;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_cost_center_category_id_fkey" foreign key (cost_center_category_id) references public.cost_center_categories(id);

alter table "public"."invoice_lines"
  add constraint "invoice_lines_cost_center_id_fkey" foreign key (cost_center_id) references public.cost_centers(id) on delete set null;

alter table "public"."invoices"
  add constraint "invoices_cost_center_category_id_fkey" foreign key (cost_center_category_id) references public.cost_center_categories(id) on delete set null;

alter table "public"."invoices"
  add constraint "invoices_cost_center_group_id_fkey" foreign key (cost_center_group_id) references public.cost_center_groups(id) on delete set null;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_invoice_id_fkey" foreign key (invoice_id) references public.invoices(id) on delete cascade;

alter table "public"."payable_entries"
  add constraint "payable_entries_cost_center_id_fkey" foreign key (cost_center_id) references public.cost_center_groups(id) on delete set null;

alter table "public"."payable_entries"
  add constraint "payable_entries_invoice_id_fkey" foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table "public"."pizza_prices"
  add constraint "pizza_prices_pizza_id_size_key" unique (pizza_id, size);

alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_recipe_id_fkey" foreign key (recipe_id) references public.pizza_recipes(id) on delete cascade;

alter table "public"."pizza_prices"
  add constraint "pizza_prices_pizza_id_fkey" foreign key (pizza_id) references public.pizzas(id) on delete cascade;

alter table "public"."pizza_recipes"
  add constraint "pizza_recipes_pizza_id_fkey" foreign key (pizza_id) references public.pizzas(id) on delete cascade;

alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_preparation_id_fkey" foreign key (preparation_id) references public.preparations(id) on delete restrict;

alter table "public"."preparation_items"
  add constraint "preparation_items_preparation_id_fkey" foreign key (preparation_id) references public.preparations(id) on delete cascade;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_cost_center_category_id_fkey" foreign key (cost_center_category_id) references public.cost_center_categories(id) on delete set null;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_cost_center_id_fkey" foreign key (cost_center_id) references public.cost_center_groups(id) on delete set null;

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_invoice_id_fkey" foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_payable_entry_id_fkey" foreign key (payable_entry_id) references public.payable_entries(id) on delete set null;

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_payment_bank_account_id_fkey" foreign key (payment_bank_account_id) references public.bank_accounts(id);

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_recurrence_id_fkey" foreign key (recurrence_id) references public.recurring_contracts(id) on delete cascade;

alter table "public"."stock_items"
  add constraint "stock_items_category_id_fkey" foreign key (category_id) references public.stock_categories(id) on delete restrict;

alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_stock_item_id_fkey" foreign key (stock_item_id) references public.stock_items(id) on delete restrict;

alter table "public"."preparation_items"
  add constraint "preparation_items_stock_item_id_fkey" foreign key (stock_item_id) references public.stock_items(id) on delete restrict;

alter table "public"."stock_movements"
  add constraint "stock_movements_item_id_fkey" foreign key (item_id) references public.stock_items(id) on delete restrict;

alter table "public"."supplier_article_mappings"
  add constraint "supplier_article_mappings_stock_item_id_fkey" foreign key (stock_item_id) references public.stock_items(id) on delete cascade;

alter table "public"."supplier_invoice_import_lines"
  add constraint "supplier_invoice_import_lines_stock_item_id_fkey" foreign key (stock_item_id) references public.stock_items(id) on delete set null;

alter table "public"."supplier_invoice_import_lines"
  add constraint "supplier_invoice_import_lines_import_id_fkey" foreign key (import_id) references public.supplier_invoice_imports(id) on delete cascade;

alter table "public"."supplier_invoice_imports"
  add constraint "supplier_invoice_imports_duplicate_of_import_id_fkey" foreign key (duplicate_of_import_id) references public.supplier_invoice_imports(id) on delete set null;

alter table "public"."suppliers"
  add constraint "suppliers_default_cost_center_category_id_fkey" foreign key (default_cost_center_category_id) references public.cost_center_categories(id);

alter table "public"."suppliers"
  add constraint "suppliers_default_cost_center_group_id_fkey" foreign key (default_cost_center_group_id) references public.cost_center_groups(id);

alter table "public"."bank_movement_match_hints"
  add constraint "bank_movement_match_hints_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete cascade;

alter table "public"."bank_movements"
  add constraint "bank_movements_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete set null;

alter table "public"."classification_rules"
  add constraint "classification_rules_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete cascade;

alter table "public"."invoices"
  add constraint "invoices_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete set null;

alter table "public"."payable_entries"
  add constraint "payable_entries_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete set null;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete set null;

alter table "public"."supplier_import_hints"
  add constraint "supplier_import_hints_supplier_id_fkey" foreign key (supplier_id) references public.suppliers(id) on delete cascade;

alter table "public"."vendus_product_mapping"
  add constraint "vendus_mapping_pizza_check" check ((((target_type = 'pizza'::text) AND (pizza_id IS NOT NULL) AND (pizza_size IS
    NOT NULL) AND (stock_item_id IS NULL)) OR ((target_type = 'stock'::text) AND (stock_item_id IS NOT NULL) AND (pizza_id IS NULL) AND (pizza_size IS NULL))));

alter table "public"."vendus_product_mapping"
  add constraint "vendus_product_mapping_pizza_id_fkey" foreign key (pizza_id) references public.pizzas(id) on delete cascade;

alter table "public"."vendus_product_mapping"
  add constraint "vendus_product_mapping_stock_item_id_fkey" foreign key (stock_item_id) references public.stock_items(id) on delete restrict;

create index bank_movements_account_date_idx on public.bank_movements using btree (bank_account_id, booking_date)
  where (bank_account_id is not null);

create index bank_movements_booking_date_idx on public.bank_movements using btree (booking_date);

create index bank_movements_risk_idx on public.bank_movements using btree (risk_level);

create index bank_movements_statement_idx on public.bank_movements using btree (statement_import_id);

create index bank_movements_status_idx on public.bank_movements using btree (reconciliation_status);

create index bank_statement_imports_account_idx on public.bank_statement_imports using btree (account_number);

create index bank_statement_imports_period_idx on public.bank_statement_imports using btree (period_start, period_end);

create index cash_closings_closing_date_idx on public.cash_closings using btree (closing_date);

create index cash_closings_employee_id_idx on public.cash_closings using btree (employee_id);

create index cash_closings_status_idx on public.cash_closings using btree (status);

create index crm_contacts_contacted_at_idx on public.crm_contacts using btree (contacted_at);

create index crm_contacts_customer_id_idx on public.crm_contacts using btree (customer_id);

create index crm_contacts_script_code_idx on public.crm_contacts using btree (script_code);

create index crm_customer_actions_completed_idx on public.crm_customer_actions using btree (customer_id, completed_at desc)
  where (status = 'completed'::text);

create index crm_customer_actions_customer_idx on public.crm_customer_actions using btree (customer_id);

create index crm_customer_actions_pending_idx on public.crm_customer_actions using btree (status, scheduled_for)
  where (status = 'pending'::text);

create index crm_customer_tags_customer_idx on public.crm_customer_tags using btree (customer_id);

create index crm_orders_customer_id_idx on public.crm_orders using btree (customer_id);

create index crm_orders_order_date_idx on public.crm_orders using btree (order_date);

create index hr_audit_logs_created_at_idx on public.hr_audit_logs using btree (created_at desc);

create index hr_audit_logs_employee_id_idx on public.hr_audit_logs using btree (employee_id)
  where (employee_id is not null);

create index hr_audit_logs_entity_type_idx on public.hr_audit_logs using btree (entity_type);

create index hr_employee_documents_employee_id_idx on public.hr_employee_documents using btree (employee_id);

create unique index hr_employees_kiosk_pin_hash_uq on public.hr_employees using btree (kiosk_pin_hash)
  where (kiosk_pin_hash is not null);

create index hr_leave_balances_employee_idx on public.hr_leave_balances using btree (employee_id);

create index hr_leave_requests_dates_idx on public.hr_leave_requests using btree (start_date, end_date);

create index hr_leave_requests_employee_idx on public.hr_leave_requests using btree (employee_id);

create index hr_public_holidays_date_idx on public.hr_public_holidays using btree (date);

create index idx_bank_accounts_bank_id on public.bank_accounts using btree (bank_id);

create index idx_bank_movement_match_hints_desc on public.bank_movement_match_hints using btree (normalized_description);

create index idx_bank_statement_imports_bank_account_id on public.bank_statement_imports using btree (bank_account_id);

create index idx_bmei_movement_id on public.bank_movement_entity_links using btree (movement_id);

create index idx_bmel_entity on public.bank_movement_entity_links using btree (entity_type, entity_id);

create index idx_classification_rules_supplier on public.classification_rules using btree (supplier_id);

create index idx_dre_custos_fixos_year_month on public.dre_custos_fixos using btree (year, month);

create index idx_dre_custos_variaveis_year_month on public.dre_custos_variaveis using btree (year, month);

create index idx_hr_employee_payments_date on public.hr_employee_payments using btree (payment_date);

create index idx_hr_employee_payments_employee on public.hr_employee_payments using btree (employee_id);

create index idx_hr_employees_status on public.hr_employees using btree (status);

create index idx_hr_shift_attendance_work_shift_id on public.hr_shift_attendance using btree (work_shift_id);

create index idx_hr_work_shifts_employee_date on public.hr_work_shifts using btree (employee_id, work_date);

create index idx_hr_work_shifts_work_date on public.hr_work_shifts using btree (work_date);

create index idx_invoice_lines_cost_center on public.invoice_lines using btree (cost_center_id);

create index idx_invoice_lines_invoice_id on public.invoice_lines using btree (invoice_id);

create index idx_invoices_invoice_date on public.invoices using btree (invoice_date desc);

create index idx_invoices_pending_direct_debits on public.invoices using btree (is_direct_debit, direct_debit_date)
  where ((is_direct_debit = true) AND (status <> all (ARRAY['paid'::text, 'cancelled'::text])));

create index idx_invoices_reconciliation_status on public.invoices using btree (reconciliation_status);

create index idx_invoices_status on public.invoices using btree (status);

create index idx_invoices_supplier_id on public.invoices using btree (supplier_id);

create index idx_payable_entries_source on public.payable_entries using btree (source);

create index idx_pizza_prices_pizza_id on public.pizza_prices using btree (pizza_id);

create index idx_pizza_recipe_items_preparation_id on public.pizza_recipe_items using btree (preparation_id);

create index idx_pizza_recipe_items_recipe_id on public.pizza_recipe_items using btree (recipe_id);

create index idx_pizza_recipe_items_stock_item_id on public.pizza_recipe_items using btree (stock_item_id);

create unique index idx_pizza_recipes_one_active_per_pizza on public.pizza_recipes using btree (pizza_id)
  where (is_active = true);

create index idx_pizza_recipes_pizza_id on public.pizza_recipes using btree (pizza_id);

create index idx_pizzas_category on public.pizzas using btree (category);

create index idx_pizzas_is_active on public.pizzas using btree (is_active);

create index idx_preparation_items_preparation_id on public.preparation_items using btree (preparation_id);

create index idx_preparation_items_stock_item_id on public.preparation_items using btree (stock_item_id);

create index idx_recurring_contracts_status on public.recurring_contracts using btree (status);

create index idx_recurring_contracts_supplier on public.recurring_contracts using btree (supplier_id);

create index idx_recurring_contracts_type on public.recurring_contracts using btree (type);

create index idx_recurring_occurrences_due_date on public.recurring_occurrences using btree (due_date);

create index idx_recurring_occurrences_paid_at on public.recurring_occurrences using btree (paid_at)
  where (paid_at is not null);

create index idx_recurring_occurrences_period on public.recurring_occurrences using btree (period);

create index idx_recurring_occurrences_recurrence on public.recurring_occurrences using btree (recurrence_id);

create index idx_recurring_occurrences_status on public.recurring_occurrences using btree (status);

create index idx_recurring_occurrences_unpaid on public.recurring_occurrences using btree (status)
  where (status = ANY (ARRAY['forecast'::text, 'awaiting_invoice'::text, 'invoice_linked'::text]));

create index idx_stock_categories_name on public.stock_categories using btree (name);

create index idx_stock_items_category_id on public.stock_items using btree (category_id);

create index idx_stock_items_is_active on public.stock_items using btree (is_active);

create unique index idx_stock_items_sku on public.stock_items using btree (sku)
  where ((sku is not null) AND (sku <> ''::text));

create index idx_stock_items_type on public.stock_items using btree (type);

create index idx_stock_movements_created_at on public.stock_movements using btree (created_at desc);

create index idx_stock_movements_item_id on public.stock_movements using btree (item_id);

create index idx_stock_movements_movement_date on public.stock_movements using btree (movement_date desc);

create index idx_stock_movements_type on public.stock_movements using btree (type);

create index idx_supplier_import_hints_normalized_name on public.supplier_import_hints using btree (normalized_name);

create index idx_supplier_invoice_import_lines_import on public.supplier_invoice_import_lines using btree (import_id);

create index idx_supplier_invoice_imports_business_key on public.supplier_invoice_imports using btree (business_key);

create index idx_supplier_invoice_imports_created_at on public.supplier_invoice_imports using btree (created_at desc);

create index idx_supplier_invoice_imports_status on public.supplier_invoice_imports using btree (status);

create index idx_vendus_mapping_match on public.vendus_product_mapping using btree (match_by, match_value);

create index idx_vendus_mapping_pizza on public.vendus_product_mapping using btree (pizza_id)
  where (pizza_id is not null);

create index idx_vendus_mapping_stock on public.vendus_product_mapping using btree (stock_item_id)
  where (stock_item_id is not null);

create unique index pizza_recipe_items_preparation_unique on public.pizza_recipe_items using btree (recipe_id, preparation_id, size)
  where (preparation_id is not null);

create unique index pizza_recipe_items_stock_unique on public.pizza_recipe_items using btree (recipe_id, stock_item_id, size)
  where (stock_item_id is not null);

create index stock_movements_item_id_idx on public.stock_movements using btree (item_id);

create index stock_movements_item_purchase_idx on public.stock_movements using btree (item_id, movement_date desc, created_at desc)
  where (type = 'purchase'::public.stock_movement_type);

create index supplier_article_mappings_descriptions_idx on public.supplier_article_mappings using gin (supplier_article_description_normalized);

create index supplier_article_mappings_supplier_item_idx on public.supplier_article_mappings using btree (supplier_normalized, stock_item_id);

create policy "Allow all for anon channels" on "public"."channels"
  for all
  to PUBLIC
  using (true)
  with check (true);

create policy "Allow delete for anon" on "public"."dre_custos_fixos"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."dre_custos_fixos"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."dre_custos_fixos"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."dre_custos_fixos"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."dre_custos_variaveis"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."dre_custos_variaveis"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."dre_custos_variaveis"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."dre_custos_variaveis"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."pizza_prices"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."pizza_prices"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."pizza_prices"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."pizza_prices"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."pizza_recipe_items"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."pizza_recipe_items"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."pizza_recipe_items"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."pizza_recipe_items"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."pizza_recipes"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."pizza_recipes"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."pizza_recipes"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."pizza_recipes"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."pizzas"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."pizzas"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."pizzas"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."pizzas"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."preparation_items"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."preparation_items"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."preparation_items"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."preparation_items"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."preparations"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."preparations"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."preparations"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."preparations"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."stock_categories"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."stock_categories"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."stock_categories"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."stock_categories"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."stock_items"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."stock_items"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."stock_items"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."stock_items"
  for update
  to PUBLIC
  using (true);

create policy "Allow delete for anon" on "public"."stock_movements"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."stock_movements"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."stock_movements"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."stock_movements"
  for update
  to PUBLIC
  using (true);

create policy "Allow all for anon supplier_invoice_import_lines" on "public"."supplier_invoice_import_lines"
  for all
  to PUBLIC
  using (true)
  with check (true);

create policy "Allow all for anon supplier_invoice_imports" on "public"."supplier_invoice_imports"
  for all
  to PUBLIC
  using (true)
  with check (true);

create policy "Allow delete for anon" on "public"."vendus_product_mapping"
  for delete
  to PUBLIC
  using (true);

create policy "Allow insert for anon" on "public"."vendus_product_mapping"
  for insert
  to PUBLIC
  with check (true);

create policy "Allow read for anon" on "public"."vendus_product_mapping"
  for select
  to PUBLIC
  using (true);

create policy "Allow update for anon" on "public"."vendus_product_mapping"
  for update
  to PUBLIC
  using (true);

comment on column "public"."crm_customers"."eatz_avg_ticket" is 'Ticket médio informado pelo snapshot eatz.';

comment on column "public"."crm_customers"."eatz_last_order_date" is 'Data do último pedido no snapshot eatz.';

comment on column "public"."crm_customers"."eatz_marketing_opt_in" is 'Consentimento de marketing informado pela eatz; não substitui opt_in do CRM.';

comment on column "public"."crm_customers"."eatz_order_count" is 'Quantidade acumulada de pedidos no snapshot eatz.';

comment on column "public"."crm_customers"."eatz_registered_at" is 'Data de cadastro na plataforma eatz; não substitui registered_at do CRM.';

comment on column "public"."crm_customers"."eatz_segment" is 'Segmento informado pela eatz; não equivale ao campo inactive do CRM.';

comment on column "public"."crm_customers"."eatz_snapshot_at" is 'Data de referência do snapshot eatz.';

comment on column "public"."crm_customers"."eatz_total_spent" is 'Valor acumulado gasto no snapshot eatz.';

comment on column "public"."dre_custos_variaveis"."categoria" is 'producao | venda';

comment on column "public"."hr_employee_payments"."is_paid" is 'True quando o pagamento foi efectivamente transferido';

comment on column "public"."hr_employee_payments"."salary_period_month" is 'Mês de referência 1–12 (só para salários)';

comment on column "public"."hr_employee_payments"."salary_period_year" is 'Ano civil de referência (só para salários)';

comment on column "public"."hr_employees"."base_salary" is 'Salário base mensal em EUR (optional)';

comment on column "public"."hr_employees"."employment_type" is 'Efetivo (permanent), Contrato a termo (contract), Extra (extra)';

comment on column "public"."hr_employees"."hourly_rate" is 'Valor por hora em EUR (só relevante quando salary_type = "hourly")';

comment on column "public"."hr_employees"."job_role" is 'Função: manager (Gerente), prep (Preparador), service (Serviço)';

comment on column "public"."hr_employees"."salary_type" is '"fixed" = salário fixo mensal; "hourly" = pago à hora';

comment on column "public"."hr_employees"."weekly_schedule" is 'Escala semanal recorrente (hora local loja). Null = nunca definido.';

comment on column "public"."invoices"."cost_center_category_id" is 'Centro de custo (subcategoria) padrão desta fatura. Quando definido, propaga-se a todas as linhas.';

comment on column "public"."pizza_recipe_items"."waste_factor" is 'Ex: 0.05 para 5% de perda';

comment on column "public"."pizzas"."category" is 'classics | specials | sweeties';

comment on column "public"."preparations"."use_as_unit" is 'true → quantity na receita representa unidades (1 = execução completa); false → quantity representa uma quantidade parcial dividida por yield_qty';

comment on column "public"."preparations"."yield_qty" is 'Quantidade produzida pela receita (ex: 500)';

comment on column "public"."preparations"."yield_unit" is 'Unidade do output (ex: g, ml, un)';

comment on column "public"."recurring_occurrences"."payment_bank_account_id" is 'Conta bancária debitada no pagamento (preenchida ao marcar como pago)';

comment on column "public"."recurring_occurrences"."payment_notes" is 'Observação livre sobre o pagamento (ex: "via homebanking")';

comment on column "public"."stock_items"."min_stock" is 'Stock mínimo em base_unit';

comment on column "public"."stock_items"."purchase_reference_unit_cost_with_vat" is 'Custo de referência por base_unit com IVA (opcional).';

comment on column "public"."stock_items"."purchase_reference_unit_cost_without_vat" is 'Custo de referência por base_unit sem IVA (opcional).';

comment on column "public"."stock_items"."sale_price" is 'Preço de venda (apenas se is_sellable = true)';

comment on column "public"."stock_items"."sku" is 'Código do produto (opcional)';

comment on column "public"."stock_movements"."movement_date" is 'Data em que a movimentação ocorreu (editável); usado em relatórios de período';

comment on column "public"."stock_movements"."quantity" is 'Positivo = entrada, negativo = saída (em base_unit do item)';

comment on column "public"."stock_movements"."unit_cost_per_base_unit_with_vat" is 'Custo unitário com IVA (compras).';

comment on column "public"."stock_movements"."unit_cost_per_base_unit_without_vat" is 'Custo unitário sem IVA (compras).';

comment on column "public"."supplier_article_mappings"."quantity_per_invoice_unit" is 'Fator de conversão de unidades: stock_qty = invoice_qty × este valor (ex.: 10 para pack de 10 un, 0.001 para g→kg)';

comment on column "public"."supplier_article_mappings"."stock_item_id" is 'Item de stock para o qual este artigo do fornecedor é mapeado';

comment on column "public"."supplier_article_mappings"."supplier_article_code" is 'Código do artigo na fatura (informativo — não é chave de lookup, pode variar entre faturas)';

comment on column "public"."supplier_article_mappings"."supplier_article_description" is 'Descrição do artigo na última fatura em que foi mapeado (informativo)';

comment on column "public"."supplier_article_mappings"."supplier_article_description_normalized" is 'Array de descrições normalizadas conhecidas para este artigo/fornecedor. Cresce a cada fatura confirmada.';

comment on column "public"."supplier_article_mappings"."supplier_normalized" is 'Nome do fornecedor normalizado (lowercase, trim) — usado como chave de lookup';

comment on column "public"."supplier_invoice_import_lines"."discount_pct" is 'Desconto total da linha em decimal (0.10 = 10%). Nulo se sem desconto.';

comment on column "public"."supplier_invoice_import_lines"."supplier_article_code" is 'Referência/código do artigo na fatura do fornecedor (ex.: 019000)';

comment on column "public"."supplier_invoice_imports"."business_key" is 'Chave única lógica (fornecedor+nº+data) para detetar duplicados';

comment on table "public"."bank_movement_match_hints" is 'Learning de conciliação bancária: descrição normalizada → fornecedor confirmado. use_count incrementa em cada reconciliação manual com o mesmo padrão.';

comment on table "public"."crm_customer_actions" is 'Timeline nova do CRM. Não é alimentada por crm_contacts nem por manual_followup_date legados.';

comment on table "public"."dre_custos_fixos" is 'DRE: custos fixos por ano/mês (lista única)';

comment on table "public"."dre_custos_variaveis" is 'DRE: custos variáveis por ano/mês (producao e venda)';

comment on table "public"."hr_employee_payments" is 'Angrybox RH: registos de pagamento (MVP)';

comment on table "public"."hr_employees" is 'Angrybox RH: dados de funcionários';

comment on table "public"."hr_shift_attendance" is 'Execução real vs turno planeado; ausência de linha = conferência pendente no cliente.';

comment on table "public"."hr_work_shifts" is 'Angrybox RH: turnos por dia civil';

comment on table "public"."pizza_prices" is 'Preço por tamanho (small/large) por pizza';

comment on table "public"."pizza_recipe_items" is 'Ingredientes da receita por tamanho; quantity na base_unit do stock_items';

comment on table "public"."pizza_recipes" is 'Receitas (versões) por pizza; apenas uma is_active = true por pizza';

comment on table "public"."pizzas" is 'Pizzas (classics, specials, sweeties)';

comment on table "public"."preparation_items" is 'Ingredientes de cada preparo; quantity na base_unit do stock_item';

comment on table "public"."preparations" is 'Fichas técnicas (sub-receitas): produzem yield_qty/yield_unit a partir de ingredientes de stock';

comment on table "public"."stock_categories" is 'Categorias de produtos para stock (ex: Ingredientes, Bebidas)';

comment on table "public"."stock_items" is 'Itens de stock (ingredientes, bebidas, embalagens, etc.)';

comment on table "public"."stock_movements" is 'Movimentações de stock; quantidade atual = SUM(quantity) por item';

comment on table "public"."supplier_article_mappings" is 'Mapeamento persistente entre artigos de fornecedor (código + descrição) e itens de stock';

comment on table "public"."supplier_invoice_imports" is 'Faturas de fornecedor: upload → parse OpenAI → confirmação → purchase em stock_movements';

comment on table "public"."vendus_product_mapping" is 'Mapeia produtos Vendus (reference ou title) para pizza+size ou stock_item; entradas [IGNORAR...] não são inseridas';

revoke all on function "public"."custom_access_token_hook"(jsonb) from public;

grant execute on function "public"."custom_access_token_hook"(jsonb) to "postgres", "service_role", "supabase_auth_admin";

grant execute on function "public"."get_stock_quantities_with_last_purchase"(uuid[]) to public, "anon", "authenticated", "postgres", "service_role";

revoke all on schema "public" from "supabase_auth_admin";

grant usage on schema "public" to "supabase_auth_admin";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."analytics_monthly_cache" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."app_users"
  to "anon", "authenticated", "postgres", "service_role", "supabase_auth_admin";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_accounts" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_movement_entity_links" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_movement_match_hints" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_movements" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_reconciliation_rules" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."bank_statement_imports" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."banks" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cash_closings" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."channels" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."classification_rules" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cost_center_categories" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cost_center_groups" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cost_centers" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_action_types" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_contacts" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_customer_actions" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_customer_tags" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_customers" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_orders" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_parameters" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_scripts" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."crm_tags" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dre_custos_fixos" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."dre_custos_variaveis" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_audit_logs" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_employee_documents" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_employee_payments" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_employees" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_leave_balances" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_leave_requests" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_public_holidays" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_shift_attendance" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."hr_work_shifts" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."invoice_lines" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."invoices" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."payable_entries" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pizza_prices" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pizza_recipe_items" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pizza_recipes" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."pizzas" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."preparation_items" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."preparations" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."recurring_contracts" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."recurring_occurrences" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."stock_categories" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."stock_items" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."stock_movements" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."supplier_article_mappings" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."supplier_import_hints" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."supplier_invoice_import_lines"
  to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."supplier_invoice_imports" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."suppliers" to "anon", "authenticated", "postgres", "service_role";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."vendus_product_mapping" to "anon", "authenticated", "postgres", "service_role";

grant usage on type "public"."pizza_category" to "postgres";

grant usage on type "public"."pizza_size" to "postgres";

grant usage on type "public"."stock_base_unit" to "postgres";

grant usage on type "public"."stock_item_type" to "postgres";

grant usage on type "public"."stock_movement_type" to "postgres";

grant usage on type "public"."supplier_invoice_import_status" to "postgres";

grant usage on type "public"."supplier_invoice_line_status" to "postgres";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "anon";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "authenticated";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "service_role";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "anon";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "authenticated";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "service_role";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "anon";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "authenticated";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "service_role";

