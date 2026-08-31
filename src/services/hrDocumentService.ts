import { randomUUID } from "crypto";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import { objectStorage } from "../infra/scoped-db/object-storage.js";
import type { OrganizationId } from "../kernel/organization-id.js";

export type DocumentType = "contract" | "id_card" | "nif" | "iban" | "other";

export type HrEmployeeDocument = {
  id: string;
  employeeId: string;
  documentType: DocumentType;
  fileName: string;
  storagePath: string;
  uploadedAt: string;
};

const STORAGE_BUCKET = "hr-documents";

type DocRow = {
  id: string;
  employee_id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

function rowToDoc(row: DocRow): HrEmployeeDocument {
  return {
    id: row.id,
    employeeId: row.employee_id,
    documentType: row.document_type as DocumentType,
    fileName: row.file_name,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
  };
}

export async function listDocuments(
  organizationId: OrganizationId,
  employeeId: string,
): Promise<HrEmployeeDocument[]> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_employee_documents")
    .select("id, employee_id, document_type, file_name, storage_path, uploaded_at")
    .eq("employee_id", employeeId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`RH documentos: ${error.message}`);
  return ((data ?? []) as unknown as DocRow[]).map(rowToDoc);
}

export async function uploadDocument(
  organizationId: OrganizationId,
  options: {
    employeeId: string;
    documentType: DocumentType;
    fileName: string;
    buffer: Buffer;
    mimeType: string;
  },
): Promise<HrEmployeeDocument> {
  const { employeeId, documentType, fileName, buffer, mimeType } = options;
  const id = randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${employeeId}/${id}/${safeName}`;

  await objectStorage.upload(STORAGE_BUCKET, storagePath, buffer, mimeType);

  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_employee_documents")
    .insert({ id, employee_id: employeeId, document_type: documentType, file_name: fileName, storage_path: storagePath })
    .select("id, employee_id, document_type, file_name, storage_path, uploaded_at")
    .single();

  if (error) {
    await objectStorage.remove(STORAGE_BUCKET, storagePath).catch(() => {});
    throw new Error(`Guardar documento: ${error.message}`);
  }
  return rowToDoc(data as unknown as DocRow);
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  return objectStorage.createSignedUrl(STORAGE_BUCKET, storagePath, 120);
}

export async function deleteDocument(organizationId: OrganizationId, docId: string): Promise<void> {
  const { data, error: fetchErr } = await createScopedQuery(organizationId)
    .table("hr_employee_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  if (fetchErr) throw new Error(`RH documento: ${fetchErr.message}`);
  if (!data) throw new Error("Documento não encontrado");

  const { storage_path } = data as unknown as { storage_path: string };
  await objectStorage.remove(STORAGE_BUCKET, storage_path);

  const { error } = await createScopedQuery(organizationId)
    .table("hr_employee_documents")
    .delete()
    .eq("id", docId);
  if (error) throw new Error(`Apagar documento: ${error.message}`);
}
