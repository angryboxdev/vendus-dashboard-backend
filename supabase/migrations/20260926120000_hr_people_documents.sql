-- RH-02 (Pessoas & Documentos) — extensão aditiva de hr_employees/
-- hr_employee_documents/hr_audit_logs, mais o bucket de storage novo para
-- fotos de colaborador. Nada aqui remove ou renomeia colunas existentes: a
-- área "Funcionários"/"Documentos" legacy (src/routes/hrRoutes.ts) continua
-- a funcionar sem alterações durante a migração gradual (ver
-- src/modules/hr/README.md, secção "Estratégia de coexistência").

alter table hr_employees
  add column if not exists photo_storage_path text;

alter table hr_employee_documents
  add column if not exists category text,
  add column if not exists mandatory boolean not null default false,
  add column if not exists expires_at date,
  add column if not exists origin text not null default 'rh'
    check (origin in ('rh', 'colaborador', 'sistema')),
  add column if not exists status text not null default 'valid'
    check (status in ('valid', 'pending_validation', 'rejected', 'removed')),
  add column if not exists version integer not null default 1,
  add column if not exists previous_version_id uuid references hr_employee_documents(id),
  add column if not exists is_current boolean not null default true,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes integer,
  add column if not exists uploaded_by text;

-- Backfill: mapeia o enum antigo (document_type, que continua a existir e a
-- ser a coluna que o ecrã legacy lê/escreve) para as categorias novas do
-- dossiê — não é uma cópia literal, porque os slugs não coincidem
-- ("contract" vs "contrato_trabalho" etc.). Sem este mapeamento, um
-- documento já anexado apareceria com uma etiqueta em bruto e não seria
-- reconhecido como preenchendo a categoria obrigatória correspondente.
update hr_employee_documents set
  category = case document_type
    when 'contract' then 'contrato_trabalho'
    when 'id_card'  then 'cartao_cidadao'
    when 'nif'      then 'nif'
    when 'iban'     then 'comprovativo_iban'
    else 'outro'
  end,
  mandatory = document_type in ('contract', 'id_card', 'nif', 'iban')
where category is null;

alter table hr_audit_logs
  add column if not exists correlation_id uuid;

-- Bucket privado para fotos de colaborador (dado pessoal — RGPD). Mesma
-- política de acesso do "hr-documents": service role da aplicação passa por
-- cima da RLS abaixo; as políticas são o backstop para um futuro chamador
-- com credencial não privilegiada (ver 20260909130000_hr_documents_storage_rls.sql).
insert into storage.buckets (id, name, public)
values ('hr-photos', 'hr-photos', false)
on conflict (id) do nothing;

create policy "hr-photos: org-scoped select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-photos: org-scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-photos: org-scoped update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = current_org()::text
  )
  with check (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-photos: org-scoped delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = current_org()::text
  );
