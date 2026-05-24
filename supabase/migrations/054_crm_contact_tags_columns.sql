-- Guardar quais tags foram adicionadas/removidas em cada registo de contacto
alter table public.crm_contacts
  add column if not exists tags_added  text[] not null default '{}',
  add column if not exists tags_removed text[] not null default '{}';
