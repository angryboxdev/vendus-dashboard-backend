-- ============================================================
-- 039 — Adicionar tipo de ausência "compensatory" (folga compensatória)
-- ============================================================

ALTER TABLE public.hr_leave_requests
  DROP CONSTRAINT IF EXISTS hr_leave_requests_type_check;

ALTER TABLE public.hr_leave_requests
  ADD CONSTRAINT hr_leave_requests_type_check
  CHECK (type IN ('vacation', 'sick_leave', 'justified', 'unjustified', 'compensatory'));
