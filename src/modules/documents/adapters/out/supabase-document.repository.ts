import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  Document,
  type DocumentOrigin,
  type DocumentOwnerType,
  type DocumentStatus,
  type DocumentVisibility,
} from "../../domain/entities/document.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";

const SELECT =
  "id, org_id, owner_type, employee_id, category, mandatory, file_name, storage_path, mime_type, file_size_bytes, status, origin, issued_at, expires_at, visibility, period, version, previous_version_id, is_current, uploaded_by, uploaded_at";

interface Row {
  id: string;
  org_id: string;
  owner_type: string;
  employee_id: string | null;
  category: string;
  mandatory: boolean;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: string;
  origin: string;
  issued_at: string | null;
  expires_at: string | null;
  visibility: string | null;
  period: string | null;
  version: number;
  previous_version_id: string | null;
  is_current: boolean;
  uploaded_by: string;
  uploaded_at: string;
}

/**
 * Documento da Empresa: `employee_id` NULL e o dono é a própria organização
 * (`org_id`) — ver `20261005100000_documents_engine.sql`.
 */
function rowToDocument(row: Row): Document {
  const ownerType = row.owner_type as DocumentOwnerType;
  return Document.reconstitute({
    id: row.id,
    ownerType,
    ownerId: ownerType === "company" ? row.org_id : (row.employee_id as string),
    category: row.category,
    mandatory: row.mandatory,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    status: row.status as DocumentStatus,
    origin: row.origin as DocumentOrigin,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    visibility: row.visibility as DocumentVisibility | null,
    period: row.period ?? null,
    version: row.version,
    previousVersionId: row.previous_version_id,
    isCurrent: row.is_current,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  });
}

/** `org_id` é carimbado pelo `ScopedQuery`, nunca escrito aqui. */
function documentToRow(doc: Document): Record<string, unknown> {
  const p = doc.toProps();
  return {
    id: p.id,
    owner_type: p.ownerType,
    employee_id: p.ownerType === "employee" ? p.ownerId : null,
    category: p.category,
    mandatory: p.mandatory,
    file_name: p.fileName,
    storage_path: p.storagePath,
    mime_type: p.mimeType,
    file_size_bytes: p.fileSizeBytes,
    status: p.status,
    origin: p.origin,
    issued_at: p.issuedAt,
    expires_at: p.expiresAt,
    visibility: p.visibility,
    period: p.period,
    version: p.version,
    previous_version_id: p.previousVersionId,
    is_current: p.isCurrent,
    uploaded_by: p.uploadedBy,
    uploaded_at: p.uploadedAt,
  };
}

/**
 * Tabela `hr_employee_documents` — motor único de documentos (Empresa e
 * Colaborador); o nome com prefixo `hr_` é histórico (spec D9).
 */
export class SupabaseDocumentRepository implements DocumentRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<Document | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToDocument(data as unknown as Row);
  }

  async findCurrentByOwners(organizationId: OrganizationId, ownerType: DocumentOwnerType, ownerIds: string[]): Promise<Document[]> {
    if (ownerIds.length === 0) return [];
    let q = this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("owner_type", ownerType)
      .eq("is_current", true);
    // Empresa: o dono é a própria organização, já filtrada pelo helper.
    if (ownerType === "employee") q = q.in("employee_id", ownerIds);
    else if (!ownerIds.includes(organizationId)) return [];
    const { data, error } = await q.order("category", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDocument);
  }

  async findVersionHistory(
    organizationId: OrganizationId,
    ownerType: DocumentOwnerType,
    ownerId: string,
    category: string,
  ): Promise<Document[]> {
    let q = this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .select(SELECT)
      .eq("owner_type", ownerType)
      .eq("category", category);
    if (ownerType === "employee") q = q.eq("employee_id", ownerId);
    else if (ownerId !== organizationId) return [];
    const { data, error } = await q.order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDocument);
  }

  async create(organizationId: OrganizationId, document: Document): Promise<Document> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employee_documents")
      .insert(documentToRow(document))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDocument(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, document: Document): Promise<Document> {
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
