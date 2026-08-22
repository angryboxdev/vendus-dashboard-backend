-- Documentos de funcionários (contrato, CC, NIF, IBAN, etc.)
-- O storage dos ficheiros fica no bucket privado "hr-documents" do Supabase Storage.

CREATE TABLE hr_employee_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  document_type text        NOT NULL CHECK (document_type IN ('contract', 'id_card', 'nif', 'iban', 'other')),
  file_name     text        NOT NULL,
  storage_path  text        NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hr_employee_documents_employee_id_idx ON hr_employee_documents(employee_id);
