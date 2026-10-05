-- Retira a dependência da "Categoria nas Escalas" (antiga "Função":
-- manager|prep|service). Decisão do utilizador em 2026-10-05: o Cargo
-- (`hr_positions`) passa a ser o único conceito — cargos, rotações,
-- assiduidade e documentos deixam de ler/escrever a categoria.
--
-- Não destrutiva: nenhuma coluna nem valor é apagado. Só deixam de ser
-- obrigatórias as colunas que o código novo já não escreve:
-- - `hr_positions.operational_category` (cargos novos ficam a NULL);
-- - `hr_shift_rotations.job_role` (rotações novas ficam a NULL).
-- As restrições CHECK existentes continuam válidas (NULL passa o CHECK).
--
-- `hr_employees.job_role` não muda: continua NOT NULL com default
-- 'service' e só é lida pelas páginas legacy (ficha antiga do colaborador);
-- o código novo deixou de a ler e escrever.
--
-- A remoção física destas colunas fica para quando o legacy de RH for
-- retirado. Reexecutável.

alter table public.hr_positions
  alter column operational_category drop not null;

alter table public.hr_shift_rotations
  alter column job_role drop not null;

comment on column public.hr_positions.operational_category is
  'OBSOLETA (2026-10-05): já não é lida nem escrita pelo código. A remover quando o legacy de RH for retirado.';
comment on column public.hr_shift_rotations.job_role is
  'OBSOLETA (2026-10-05): rotações já não dependem da antiga Função. A remover com o legacy.';
comment on column public.hr_employees.job_role is
  'OBSOLETA (2026-10-05): substituída por position_id (Cargo). Só lida pelas páginas legacy de RH.';
