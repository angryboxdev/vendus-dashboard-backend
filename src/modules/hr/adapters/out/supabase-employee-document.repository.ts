import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { EmployeeDocument, type DocumentOrigin, type DocumentStatus } from "../../domain/entities/employee-document.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";

const SELECT =
  "id, employee_id, category, mandatory, file_name, storage_path, mime_type, file_size_bytes, status, origin, expires_at, version, previous_version_id, is_current, uploaded_by, uploaded_at";

interface Row {
  id: string;
  employee_id: string;
  category: string;
  mandatory: boolean;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: string;
  origin: string;
  expires_at: string | null;
  version: number;
  previous_version_id: string | null;
  is_current: boolean;
  uploaded_by: string;
  uploaded_at: string;
}

function rowToDocument(row: Row): EmployeeDocument {
  return EmployeeDocument.reconstitute({
    id: row.id,
    employeeId: row.employee_id,
    category: row.category,
    mandatory: row.mandatory,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    status: row.status as DocumentStatus,
    origin: row.origin as DocumentOrigin,
    expiresAt: row.expires_at,
    version: row.version,
    previousVersionId: row.previous_version_id,
    isCurrent: row.is_current,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  });
}

function documentToRow(doc: EmployeeDocument): Record<string, unknown> {
  const p = doc.toProps();
  return {
    id: p.id,
    employee_id: p.employeeId,
    category: p.category,
    mandatory: p.mandatory,
    file_name: p.fileName,
    storage_path: p.storagePath,
    mime_type: p.mimeType,
    file_size_bytes: p.fileSizeBytes,
    status: p.status,
    origin: p.origin,
    expires_at: p.expiresAt,
    version: p.version,
    previous_version_id: p.previousVersionId,
    is_current: p.isCurrent,
    uploaded_by: p.uploadedBy,
    uploaded_at: p.uploadedAt,
  };
}

export class SupabaseEmployeeDocumentRepository implements EmployeeDocumentRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<EmployeeDocument | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToDocument(data as unknown as Row);
  }

  async findCurrentByEmployeeId(organizationId: OrganizationId, employeeId: string): Promise<EmployeeDocument[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("employee_id", employeeId)
      .eq("is_current", true)
      .order("category", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDocument);
  }

  async findCurrentByEmployeeIds(organizationId: OrganizationId, employeeIds: string[]): Promise<EmployeeDocument[]> {
    if (employeeIds.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .in("employee_id", employeeIds)
      .eq("is_current", true);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDocument);
  }

  async findVersionHistory(
    organizationId: OrganizationId,
    employeeId: string,
    category: string,
  ): Promise<EmployeeDocument[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("employee_id", employeeId)
      .eq("category", category)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDocument);
  }

  async create(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .insert(documentToRow(document))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDocument(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, document: EmployeeDocument): Promise<EmployeeDocument> {
    const { id, ...patch } = documentToRow(document);
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .update(patch)
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDocument(data as unknown as Row);
  }
}
