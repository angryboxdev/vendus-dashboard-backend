-- RH — categorias de documento configuráveis por organização. Substitui,
-- para as categorias abaixo, a constante fixa `DEFAULT_MANDATORY_REQUIREMENTS`
-- (ver src/modules/hr/domain/services/document-status.service.ts). O grupo
-- "Documento de identificação" (cartao_cidadao/titulo_residencia/passaporte)
-- fica de fora, propositadamente — continua fixo no código (decisão
-- confirmada com o utilizador). Tabela nova, aditiva — não altera
-- hr_employee_documents.

create table if not exists public.hr_document_categories (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id),
  slug                  text not null,
  label                 text not null,
  mandatory             boolean not null default false,
  job_roles             text[] not null default '{}',  -- '{}' = todos os cargos
  accepted_mime_types   text[] not null default array['application/pdf','image/jpeg','image/png'],
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint hr_document_categories_org_slug_key unique (org_id, slug),
  constraint hr_document_categories_job_roles_valid
    check (job_roles <@ array['manager','prep','service']::text[])
);

create index if not exists hr_document_categories_org_id_idx on public.hr_document_categories (org_id);

alter table public.hr_document_categories enable row level security;

-- Semeia, para cada organização já existente, as categorias que hoje são
-- constantes fixas — para que nada mude de comportamento até o utilizador
-- editar algo pela nova tela "Categorias de documentos".
insert into public.hr_document_categories (org_id, slug, label, mandatory, job_roles, accepted_mime_types)
select o.id, v.slug, v.label, v.mandatory, '{}', array['application/pdf','image/jpeg','image/png']
from public.organizations o,
  (values
    ('contrato_trabalho', 'Contrato de trabalho', true),
    ('comprovativo_iban', 'Comprovativo de IBAN', true),
    ('apolice_seguro_at', 'Apólice de seguro de acidentes de trabalho', true),
    ('certificado_morada', 'Certificado de morada', false),
    ('ficha_colaborador', 'Ficha de colaborador', false),
    ('formacao_seguranca', 'Formação de segurança', false),
    ('atestado_saude', 'Atestado de saúde', false),
    ('nif', 'NIF', false)
  ) as v(slug, label, mandatory)
on conflict (org_id, slug) do nothing;
