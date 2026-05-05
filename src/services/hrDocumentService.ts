import { randomUUID } from "crypto";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";

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

function requireHr() {
  if (!isHrSupabaseConfigured()) {
    throw new Error("RH não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  }
  const s = getSupabaseServiceRole();
  if (!s) throw new Error("Supabase service role indisponível");
  return s;
}

export async function listDocuments(employeeId: string): Promise<HrEmployeeDocument[]> {
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_employee_documents")
    .select("id, employee_id, document_type, file_name, storage_path, uploaded_at")
    .eq("employee_id", employeeId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`RH documentos: ${error.message}`);
  return ((data ?? []) as DocRow[]).map(rowToDoc);
}

export async function uploadDocument(options: {
  employeeId: string;
  documentType: DocumentType;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<HrEmployeeDocument> {
  const { employeeId, documentType, fileName, buffer, mimeType } = options;
  const supabase = requireHr();
  const id = randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${employeeId}/${id}/${safeName}`;

  const { error: storageErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (storageErr) throw new Error(`Upload falhou: ${storageErr.message}`);

  const { data, error } = await supabase
    .from("hr_employee_documents")
    .insert({ id, employee_id: employeeId, document_type: documentType, file_name: fileName, storage_path: storagePath })
    .select("id, employee_id, document_type, file_name, storage_path, uploaded_at")
    .single();

  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Guardar documento: ${error.message}`);
  }
  return rowToDoc(data as DocRow);
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const supabase = requireHr();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) throw new Error(`URL de download: ${error?.message}`);
  return data.signedUrl;
}

export async function deleteDocument(docId: string): Promise<void> {
  const supabase = requireHr();
  const { data, error: fetchErr } = await supabase
    .from("hr_employee_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  if (fetchErr) throw new Error(`RH documento: ${fetchErr.message}`);
  if (!data) throw new Error("Documento não encontrado");

  const { storage_path } = data as { storage_path: string };
  await supabase.storage.from(STORAGE_BUCKET).remove([storage_path]);

  const { error } = await supabase.from("hr_employee_documents").delete().eq("id", docId);
  if (error) throw new Error(`Apagar documento: ${error.message}`);
}
