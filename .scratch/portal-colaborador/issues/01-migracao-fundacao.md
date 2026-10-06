Status: done (migração escrita, por aplicar)

# Migração única de fundação

Uma só migração (aplicada pelo Raul de uma vez, antes de qualquer teste no telemóvel), só aditiva:

- `org_members.role` aceita `employee` (substituir o check constraint).
- `hr_employees.user_id uuid` → `auth.users(id) on delete set null`, índice único `(org_id, user_id)` onde não nulo.
- `locations`: `latitude numeric(9,6)`, `longitude numeric(9,6)`, `geofence_radius_m integer default 100 check (> 0)`, `geofence_policy text not null default 'off' check in (off,warn,block)`.
- `hr_shift_attendance.registration_source` aceita `employee_portal`.
- Tabela `hr_attendance_punch_events` (org_id, attendance_id FK composta, employee_id, location_id, work_shift_id, kind in/out, server_at timestamptz, latitude, longitude, accuracy_m, distance_m, geofence_status inside|outside|unverified|not_required, unverified_reason, source, idempotency_key, created_by user_id; único `(org_id, idempotency_key)`), RLS `org_id = current_org()`, TABLE_REGISTRY.
