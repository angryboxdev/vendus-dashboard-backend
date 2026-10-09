-- "Confirmar ausência" (Assiduidade): a correção que resolve a ocorrência
-- guarda a ausência de Férias & Ausências a que ficou vinculada. Aditiva.

alter table public.hr_attendance_corrections
  add column if not exists absence_id uuid references public.hr_leave_requests(id);

create index if not exists hr_attendance_corrections_absence_idx
  on public.hr_attendance_corrections (absence_id)
  where absence_id is not null;
