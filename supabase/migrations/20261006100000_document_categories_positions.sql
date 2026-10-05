-- Base Organizacional 1.0 — ticket 09 "Documentos dos colaboradores"
-- (.scratch/base-organizacional).
--
-- Obrigatoriedade/aplicabilidade de uma categoria passa a ser "Todos os
-- colaboradores" ou "Cargos selecionados" (task §22) — por Cargo real
-- (`hr_positions`, ticket 07), já não pela categoria operacional fixa
-- (`job_roles`: manager|prep|service).
--
-- `position_ids` vazio = aplica-se a todos. Sem FK (array): o RH valida os
-- ids ao gravar e ignora ids de cargos que já não existam.
--
-- Migração dos dados: categorias com `job_roles` preenchido passam a ter os
-- cargos dessas categorias operacionais; `job_roles` fica vazio (uma única
-- fonte de aplicabilidade). Verificado em 2026-10-06: nenhuma categoria em
-- produção tem `job_roles` preenchido — a conversão é só por segurança.
-- Reexecutável: só converte linhas que ainda tenham `job_roles`.

alter table public.hr_document_categories
  add column if not exists position_ids uuid[] not null default '{}';

update public.hr_document_categories c
set position_ids = coalesce(
      (select array_agg(p.id order by p.name)
       from public.hr_positions p
       where p.org_id = c.org_id and p.operational_category = any (c.job_roles)),
      '{}'
    ),
    job_roles = '{}',
    updated_at = now()
where cardinality(c.job_roles) > 0;
