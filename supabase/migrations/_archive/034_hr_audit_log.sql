-- Histórico de alterações do módulo RH
CREATE TABLE hr_audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  entity_type text        NOT NULL,   -- 'employee' | 'shift' | 'payment' | 'attendance'
  entity_id   text        NOT NULL,
  action      text        NOT NULL,   -- see AuditAction in hrAuditService
  actor       text,                   -- null until auth is added
  description text        NOT NULL,
  payload_before jsonb,
  payload_after  jsonb,
  employee_id text                    -- denormalized for fast per-employee queries
);

CREATE INDEX hr_audit_logs_created_at_idx  ON hr_audit_logs (created_at DESC);
CREATE INDEX hr_audit_logs_employee_id_idx ON hr_audit_logs (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX hr_audit_logs_entity_type_idx ON hr_audit_logs (entity_type);
