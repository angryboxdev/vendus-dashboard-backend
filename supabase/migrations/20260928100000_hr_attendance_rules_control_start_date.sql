-- Corrige uma divergência entre a migração `20260927180000_hr_attendance_rules.sql`
-- (que já define `control_start_date`) e a tabela real em produção — a
-- coluna nunca chegou a ser criada lá (confirmado por leitura direta:
-- `column hr_attendance_rules.control_start_date does not exist`,
-- enquanto todas as outras colunas da mesma migração existem). Aditiva,
-- nullable, não apaga nem altera nenhuma linha existente (a tabela está
-- vazia em produção, mas mesmo que não estivesse isto seria seguro).

alter table public.hr_attendance_rules
  add column if not exists control_start_date date;
