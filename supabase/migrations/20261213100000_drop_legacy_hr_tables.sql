-- ADR-0040, fase 5 (2026-11-02, decisão do utilizador: «Apagar definitivamente»).
-- Apaga as 15 tabelas que eram só do RH antigo: o código que as usava saiu
-- (frontend #150, backend #178). Antes de correr, foi feita uma cópia de todos os
-- registos (1199 linhas, um JSON por tabela) fora do repositório — ver
-- docs/migrations/rollback/20261213100000_drop_legacy_hr_tables.sql.
--
-- As chaves estrangeiras ligam só estas tabelas entre si; nenhuma tabela que
-- fica, vista ou função depende delas. Sem `cascade`: se aparecer uma
-- dependência inesperada, a migração falha em vez de apagar mais do que devia.
-- Idempotente (`if exists`).
--
-- Ficam (usadas pelo Novo RH): hr_employees, hr_positions, hr_employee_documents,
-- hr_document_categories, hr_employee_locations, hr_audit_logs, hr_public_holidays.

drop table if exists
  public.hr_attendance_punch_events,
  public.hr_attendance_corrections,
  public.hr_attendance_rules,
  public.hr_monthly_closures,
  public.hr_shift_attendance,
  public.hr_shift_automation_issues,
  public.hr_shift_automations,
  public.hr_work_shifts,
  public.hr_shift_rotations,
  public.hr_shift_templates,
  public.hr_base_schedule_templates,
  public.hr_portal_requests,
  public.hr_leave_balances,
  public.hr_leave_requests,
  public.hr_employee_payments;
