-- Migration 037: Remove absent_justified and absent_unjustified from shift attendance.
-- Absences are now managed exclusively via hr_leave_requests.

-- 1. Delete existing absent records (dev phase, no real data)
DELETE FROM hr_shift_attendance
WHERE status IN ('absent_justified', 'absent_unjustified');

-- 2. Drop the old CHECK constraint and re-create without the absent statuses
ALTER TABLE hr_shift_attendance
  DROP CONSTRAINT IF EXISTS hr_shift_attendance_status_check;

ALTER TABLE hr_shift_attendance
  ADD CONSTRAINT hr_shift_attendance_status_check
  CHECK (status IN ('worked_as_planned', 'late', 'left_early', 'cancelled'));

-- 3. Drop absenceReason column (no longer needed for shift attendance)
ALTER TABLE hr_shift_attendance
  DROP COLUMN IF EXISTS absence_reason;
