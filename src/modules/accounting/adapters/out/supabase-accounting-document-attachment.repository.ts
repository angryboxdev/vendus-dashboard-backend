import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  AccountingDocumentAttachmentDTO,
  AccountingDocumentAttachmentRepositoryPort,
  AddAccountingDocumentAttachmentData,
} from "../../domain/ports/out/accounting-document-attachment-repository.port.js";

function toDto(row: Record<string, unknown>): AccountingDocumentAttachmentDTO {
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    storagePath: row.storage_path as string,
    fileType: row.file_type as string,
    fileHash: row.file_hash as string,
    version: row.version as number,
    uploadedBy: row.uploaded_by as string,
    uploadedAt: row.uploaded_at as string,
  };
}

/** Cada upload cria uma linha nova (versão incremental); nunca substitui nem apaga uma versão anterior. */
export class SupabaseAccountingDocumentAttachmentRepository implements AccountingDocumentAttachmentRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async add(
    organizationId: OrganizationId,
    data: AddAccountingDocumentAttachmentData,
  ): Promise<AccountingDocumentAttachmentDTO> {
    const { data: existing, error: findError } = await this.scopedQuery(organizationId)
      .table("accounting_document_attachments")
      .select("version")
      .eq("document_id", data.documentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    const nextVersion = ((existing as unknown as { version: number } | null)?.version ?? 0) + 1;

    const row = {
      id: randomUUID(),
      document_id: data.documentId,
      storage_path: data.storagePath,
      file_type: data.fileType,
      file_hash: data.fileHash,
      version: nextVersion,
      uploaded_by: data.uploadedBy,
      uploaded_at: new Date().toISOString(),
    };
    const { error } = await this.scopedQuery(organizationId).table("accounting_document_attachments").insert(row);
    if (error) throw new Error(error.message);
    return toDto(row);
  }

  async listByDocument(organizationId: OrganizationId, documentId: string): Promise<AccountingDocumentAttachmentDTO[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("accounting_document_attachments")
      .select("*")
      .eq("document_id", documentId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toDto);
  }
}
