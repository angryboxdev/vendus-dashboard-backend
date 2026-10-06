-- Modelos de Turno 2.0 (task "Modelos de Turno 2.0", 2026-10-06): Grupo do
-- modelo — SÓ organização/filtro da biblioteca (Abertura, Intermédio,
-- Fecho, Full time, Outro). Não altera horários, geração, conflitos,
-- automatizações nem turnos; ids e referências ficam iguais. "Repartido"
-- continua a ser o Tipo (2.º período), não um Grupo.
--
-- Backfill só quando o nome é óbvio (prefixo Abertura / Fecho / Full time);
-- tudo o resto fica "Outro". Feito uma única vez (só quando a coluna é
-- criada) — reexecutar não reclassifica modelos editados depois.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hr_shift_templates' and column_name = 'template_group'
  ) then
    alter table public.hr_shift_templates
      add column template_group text not null default 'OTHER'
      check (template_group in ('OPENING', 'INTERMEDIATE', 'CLOSING', 'FULL_TIME', 'OTHER'));

    update public.hr_shift_templates
    set template_group = case
      when lower(btrim(name)) like 'abertura%' then 'OPENING'
      when lower(btrim(name)) like 'fecho%' then 'CLOSING'
      when lower(btrim(name)) like 'full time%' or lower(btrim(name)) like 'full-time%' or lower(btrim(name)) like 'fulltime%' then 'FULL_TIME'
      else 'OTHER'
    end;
  end if;
end $$;
